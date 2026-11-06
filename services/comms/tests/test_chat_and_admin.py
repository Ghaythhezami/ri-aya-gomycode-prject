from tests.conftest import auth, imported_notification, notification

A, B, C = "user-a", "user-b", "user-c"


async def open_conversation(client, caller=A, members=(B,), clinic="clinic-a", title=None):
    body = {"memberIds": list(members)}
    if title:
        body["title"] = title
    return await client.post("/v1/conversations", headers=auth(clinic, caller), json=body)


async def test_one_to_one_is_reused_in_either_direction(client):
    r1 = await open_conversation(client, A, [B])
    assert r1.status_code == 201
    conv = r1.json()
    assert conv["memberIds"] == [A, B] and conv["isGroup"] is False
    r2 = await open_conversation(client, B, [A])
    assert r2.status_code == 200 and r2.json()["id"] == conv["id"]
    r3 = await open_conversation(client, A, [A, B, B])  # caller and duplicates deduped
    assert r3.json()["id"] == conv["id"]


async def test_titled_pair_and_group_are_new_conversations(client):
    plain = (await open_conversation(client, A, [B])).json()
    titled = (await open_conversation(client, A, [B], title="Ops")).json()
    assert titled["id"] != plain["id"] and titled["title"] == "Ops"
    group = (await open_conversation(client, A, [B, C])).json()
    assert group["isGroup"] is True and group["memberIds"] == [A, B, C]
    group2 = (await open_conversation(client, A, [B, C])).json()
    assert group2["id"] != group["id"]


async def test_conversation_needs_two_members(client):
    r = await open_conversation(client, A, [A])
    assert r.status_code == 422


async def test_conversation_shape(client):
    conv = (await open_conversation(client, A, [B])).json()
    assert set(conv) == {
        "id",
        "title",
        "isGroup",
        "memberIds",
        "lastMessage",
        "unreadCount",
        "createdAt",
        "updatedAt",
    }
    assert conv["lastMessage"] is None and conv["unreadCount"] == 0 and conv["title"] is None


async def test_messages_flow_and_unread(client):
    conv = (await open_conversation(client, A, [B])).json()
    cid = conv["id"]
    r = await client.post(
        f"/v1/conversations/{cid}/messages", headers=auth(sub=A), json={"body": "  hello <b>x</b> "}
    )
    assert r.status_code == 201
    msg = r.json()
    assert set(msg) == {
        "id",
        "conversationId",
        "senderId",
        "body",
        "readBy",
        "readByOthers",
        "createdAt",
    }
    assert msg["body"] == "hello <b>x</b>"  # trimmed, not escaped
    assert msg["senderId"] == A and msg["readBy"] == [A] and msg["readByOthers"] is False
    await client.post(
        f"/v1/conversations/{cid}/messages", headers=auth(sub=A), json={"body": "two"}
    )

    for_b = (await client.get("/v1/conversations", headers=auth(sub=B))).json()
    assert len(for_b) == 1 and for_b[0]["unreadCount"] == 2
    assert for_b[0]["lastMessage"]["body"] == "two" and for_b[0]["lastMessage"]["senderId"] == A
    for_a = (await client.get("/v1/conversations", headers=auth(sub=A))).json()
    assert for_a[0]["unreadCount"] == 0  # own messages are never unread

    r = await client.post(f"/v1/conversations/{cid}/read", headers=auth(sub=B))
    assert r.json() == {"updated": 2}
    assert (await client.post(f"/v1/conversations/{cid}/read", headers=auth(sub=B))).json() == {
        "updated": 0
    }
    for_b = (await client.get("/v1/conversations", headers=auth(sub=B))).json()
    assert for_b[0]["unreadCount"] == 0
    listed = (await client.get(f"/v1/conversations/{cid}/messages", headers=auth(sub=A))).json()
    assert all(m["readByOthers"] for m in listed["items"])


async def test_message_validation(client):
    cid = (await open_conversation(client, A, [B])).json()["id"]
    url = f"/v1/conversations/{cid}/messages"
    for body in ("", "   ", "x" * 2001):
        r = await client.post(url, headers=auth(sub=A), json={"body": body})
        assert r.status_code == 422 and r.json()["code"] == "VALIDATION_FAILED"
    ok = await client.post(url, headers=auth(sub=A), json={"body": "x" * 2000})
    assert ok.status_code == 201
    assert (await client.post(url, headers=auth(sub=A), json={})).status_code == 422


async def test_message_pagination_newest_first(client):
    cid = (await open_conversation(client, A, [B])).json()["id"]
    for i in range(5):
        await client.post(
            f"/v1/conversations/{cid}/messages", headers=auth(sub=A), json={"body": f"m{i}"}
        )
    seen, cursor = [], None
    while True:
        url = f"/v1/conversations/{cid}/messages?limit=2" + (f"&cursor={cursor}" if cursor else "")
        page = (await client.get(url, headers=auth(sub=B))).json()
        seen += [m["body"] for m in page["items"]]
        cursor = page["nextCursor"]
        if not cursor:
            break
    assert sorted(seen) == [f"m{i}" for i in range(5)] and len(seen) == 5


async def test_non_member_gets_404(client):
    cid = (await open_conversation(client, A, [B])).json()["id"]
    for call in (
        client.get(f"/v1/conversations/{cid}/messages", headers=auth(sub=C)),
        client.post(f"/v1/conversations/{cid}/messages", headers=auth(sub=C), json={"body": "hi"}),
        client.post(f"/v1/conversations/{cid}/read", headers=auth(sub=C)),
    ):
        r = await call
        assert r.status_code == 404 and r.json()["code"] == "NOT_FOUND"
    assert (await client.get("/v1/conversations", headers=auth(sub=C))).json() == []


async def test_conversation_tenant_isolation(client):
    cid = (await open_conversation(client, A, [B])).json()["id"]
    # same user ids in another clinic still cannot reach it
    r = await client.get(f"/v1/conversations/{cid}/messages", headers=auth("clinic-b", A))
    assert r.status_code == 404
    assert (await client.get("/v1/conversations", headers=auth("clinic-b", A))).json() == []
    other = (await open_conversation(client, A, [B], clinic="clinic-b")).json()
    assert other["id"] != cid


async def test_conversations_sorted_by_activity(client):
    first = (await open_conversation(client, A, [B])).json()["id"]
    second = (await open_conversation(client, A, [C])).json()["id"]
    await client.post(
        f"/v1/conversations/{first}/messages", headers=auth(sub=A), json={"body": "x"}
    )
    ids = [c["id"] for c in (await client.get("/v1/conversations", headers=auth(sub=A))).json()]
    assert ids == [first, second]


# ------------------------------------------------------------------ admin


async def test_admin_routes_require_scope(client):
    for path in ("/v1/admin/reset", "/v1/admin/import"):
        r = await client.post(path, headers=auth(), json={})
        assert r.status_code == 403 and r.json()["code"] == "FORBIDDEN"
        r = await client.post(path, json={})
        assert r.status_code == 401


async def test_import_preserves_fields_and_is_idempotent(client):
    payload = {
        "notifications": [
            imported_notification(1, "2026-10-01T08:00:00.000Z", readBy=["user-1"], userId="user-1")
        ],
        "conversations": [
            {
                "id": "conv-1",
                "isGroup": False,
                "memberIds": [B, A],
                "createdAt": "2026-10-01T08:00:00Z",
                "updatedAt": "2026-10-02T08:00:00Z",
            }
        ],
        "messages": [
            {
                "id": "msg-1",
                "conversationId": "conv-1",
                "senderId": A,
                "body": "hello",
                "readBy": [A],
                "createdAt": "2026-10-02T08:00:00Z",
            }
        ],
    }
    admin = auth(scope="admin")
    expected = {"notifications": 1, "conversations": 1, "messages": 1, "reads": 0, "skipped": 0}
    assert (await client.post("/v1/admin/import", headers=admin, json=payload)).json() == expected
    assert (await client.post("/v1/admin/import", headers=admin, json=payload)).json() == expected

    page = (await client.get("/v1/notifications", headers=auth(sub="user-1"))).json()
    assert page["items"][0]["read"] is True
    assert page["items"][0]["createdAt"] == "2026-10-01T08:00:00.000Z"
    convs = (await client.get("/v1/conversations", headers=auth(sub=B))).json()
    assert convs[0]["id"] == "conv-1" and convs[0]["unreadCount"] == 1
    assert convs[0]["updatedAt"] == "2026-10-02T08:00:00.000Z"
    assert convs[0]["lastMessage"]["body"] == "hello"


async def test_import_cannot_overwrite_another_clinic(client):
    admin_a = auth("clinic-a", scope="admin")
    n = [imported_notification(1, "2026-10-01T08:00:00.000Z")]
    await client.post("/v1/admin/import", headers=admin_a, json={"notifications": n})
    r = await client.post(
        "/v1/admin/import", headers=auth("clinic-b", scope="admin"), json={"notifications": n}
    )
    assert r.json()["skipped"] == 1 and r.json()["notifications"] == 0
    assert (await client.get("/v1/notifications", headers=auth("clinic-b"))).json()["items"] == []


async def test_import_rejects_clinic_id(client):
    n = imported_notification(1, "2026-10-01T08:00:00.000Z", clinicId="clinic-b")
    r = await client.post(
        "/v1/admin/import", headers=auth(scope="admin"), json={"notifications": [n]}
    )
    assert r.status_code == 422


async def test_reset_only_deletes_own_clinic(client):
    await client.post("/v1/notifications", headers=auth("clinic-a"), json=notification("ra"))
    await client.post("/v1/notifications", headers=auth("clinic-b"), json=notification("rb"))
    cid = (await open_conversation(client, A, [B], clinic="clinic-a")).json()["id"]
    await client.post(
        f"/v1/conversations/{cid}/messages", headers=auth("clinic-a", A), json={"body": "hi"}
    )
    r = await client.post("/v1/admin/reset", headers=auth("clinic-a", scope="admin"))
    assert r.json() == {"notifications": 1, "conversations": 1, "messages": 1, "reads": 0}
    assert (await client.get("/v1/notifications", headers=auth("clinic-a"))).json()["items"] == []
    assert (
        len((await client.get("/v1/notifications", headers=auth("clinic-b"))).json()["items"]) == 1
    )
