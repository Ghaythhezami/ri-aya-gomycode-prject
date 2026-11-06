import asyncio
from datetime import UTC, datetime

from tests.conftest import auth, imported_notification, notification

ADMIN = {"scope": "admin"}


async def test_create_is_idempotent_on_dedupe_key(client):
    r1 = await client.post("/v1/notifications", headers=auth(), json=notification("k1"))
    assert r1.status_code == 201 and r1.json()["created"] is True
    r2 = await client.post("/v1/notifications", headers=auth(), json=notification("k1"))
    assert r2.status_code == 200
    assert r2.json() == {"id": r1.json()["id"], "created": False}


async def test_dedupe_key_of_other_clinic_is_not_revealed(client):
    await client.post("/v1/notifications", headers=auth("clinic-a"), json=notification("shared"))
    r = await client.post(
        "/v1/notifications", headers=auth("clinic-b"), json=notification("shared")
    )
    assert r.status_code == 422


async def test_bulk_counts_duplicates(client):
    items = [notification(f"b{i}") for i in range(5)]
    r = await client.post("/v1/notifications/bulk", headers=auth(), json={"items": items})
    assert r.json() == {"created": 5, "duplicates": 0}
    again = items + [notification("b-new"), notification("b-new")]
    r = await client.post("/v1/notifications/bulk", headers=auth(), json={"items": again})
    assert r.json() == {"created": 1, "duplicates": 6}


async def test_bulk_limits(client):
    r = await client.post("/v1/notifications/bulk", headers=auth(), json={"items": []})
    assert r.status_code == 422
    items = [notification(f"x{i}") for i in range(1001)]
    r = await client.post("/v1/notifications/bulk", headers=auth(), json={"items": items})
    assert r.status_code == 422


async def test_dto_shape(client):
    await client.post("/v1/notifications", headers=auth(), json=notification("shape"))
    page = (await client.get("/v1/notifications", headers=auth())).json()
    item = page["items"][0]
    assert set(item) == {
        "id",
        "category",
        "titleKey",
        "bodyKey",
        "params",
        "entityType",
        "entityId",
        "read",
        "createdAt",
    }
    assert item["createdAt"].endswith("Z") and "." in item["createdAt"]
    assert item["read"] is False
    assert set(page) == {"items", "nextCursor", "unreadCount"}


async def test_visibility_rules(client):
    await client.post("/v1/notifications", headers=auth(), json=notification("all"))
    await client.post(
        "/v1/notifications", headers=auth(), json=notification("mine", userId="user-1")
    )
    await client.post(
        "/v1/notifications", headers=auth(), json=notification("theirs", userId="user-2")
    )
    mine = (await client.get("/v1/notifications", headers=auth(sub="user-1"))).json()
    other = (await client.get("/v1/notifications", headers=auth(sub="user-2"))).json()
    assert len(mine["items"]) == 2 and mine["unreadCount"] == 2
    assert len(other["items"]) == 2 and other["unreadCount"] == 2
    all_ids_1 = {i["id"] for i in mine["items"]}
    all_ids_2 = {i["id"] for i in other["items"]}
    assert len(all_ids_1 & all_ids_2) == 1  # only the broadcast is shared


async def test_user_cannot_read_anothers_targeted_notification(client):
    created = await client.post(
        "/v1/notifications", headers=auth(), json=notification("t", userId="user-2")
    )
    nid = created.json()["id"]
    r = await client.post(f"/v1/notifications/{nid}/read", headers=auth(sub="user-1"))
    assert r.status_code == 404 and r.json()["code"] == "NOT_FOUND"
    r = await client.post(f"/v1/notifications/{nid}/read", headers=auth(sub="user-2"))
    assert r.status_code == 200 and r.json() == {"success": True}


async def test_tenant_isolation(client):
    created = await client.post(
        "/v1/notifications", headers=auth("clinic-a"), json=notification("iso")
    )
    nid = created.json()["id"]
    other = auth("clinic-b")
    assert (await client.get("/v1/notifications", headers=other)).json()["items"] == []
    assert (await client.get("/v1/notifications/unread-count", headers=other)).json() == {
        "count": 0,
        "capped": False,
    }
    assert (await client.post(f"/v1/notifications/{nid}/read", headers=other)).status_code == 404
    assert (await client.post("/v1/notifications/read-all", headers=other)).json() == {"updated": 0}
    # clinic A's notification is still unread
    assert (
        await client.get("/v1/notifications/unread-count", headers=auth("clinic-a"))
    ).json() == {"count": 1, "capped": False}


async def test_read_and_unread_counts(client):
    ids = []
    for i in range(3):
        r = await client.post("/v1/notifications", headers=auth(), json=notification(f"u{i}"))
        ids.append(r.json()["id"])
    h = auth(sub="user-1")
    assert (await client.get("/v1/notifications/unread-count", headers=h)).json() == {
        "count": 3,
        "capped": False,
    }
    await client.post(f"/v1/notifications/{ids[0]}/read", headers=h)
    await client.post(f"/v1/notifications/{ids[0]}/read", headers=h)  # idempotent
    assert (await client.get("/v1/notifications/unread-count", headers=h)).json() == {
        "count": 2,
        "capped": False,
    }
    # read state is per user
    assert (
        await client.get("/v1/notifications/unread-count", headers=auth(sub="user-2"))
    ).json() == {"count": 3, "capped": False}
    unread = (await client.get("/v1/notifications?unread=true", headers=h)).json()
    assert len(unread["items"]) == 2 and unread["unreadCount"] == 2
    full = (await client.get("/v1/notifications", headers=h)).json()
    assert sorted(i["read"] for i in full["items"]) == [False, False, True]


async def test_read_all(client):
    for i in range(4):
        await client.post("/v1/notifications", headers=auth(), json=notification(f"ra{i}"))
    h = auth(sub="user-1")
    await asyncio.sleep(0.02)
    assert (await client.post("/v1/notifications/read-all", headers=h)).json() == {"updated": 4}
    assert (await client.post("/v1/notifications/read-all", headers=h)).json() == {"updated": 0}
    assert (await client.get("/v1/notifications/unread-count", headers=h)).json() == {
        "count": 0,
        "capped": False,
    }


async def test_category_filter(client):
    await client.post("/v1/notifications", headers=auth(), json=notification("c1"))
    await client.post(
        "/v1/notifications", headers=auth(), json=notification("c2", category="CONFLICT")
    )
    r = await client.get("/v1/notifications?category=CONFLICT", headers=auth())
    assert [i["category"] for i in r.json()["items"]] == ["CONFLICT"]
    assert (await client.get("/v1/notifications?category=BOGUS", headers=auth())).status_code == 422


async def test_pagination_with_ties_on_created_at(client):
    stamp = "2026-11-01T10:00:00.000Z"
    items = [imported_notification(i, stamp) for i in range(7)]
    items += [imported_notification(7 + i, "2026-11-01T11:00:00.000Z") for i in range(2)]
    r = await client.post(
        "/v1/admin/import", headers=auth(scope="admin"), json={"notifications": items}
    )
    assert r.json()["notifications"] == 9

    seen, cursor, pages = [], None, 0
    while True:
        url = "/v1/notifications?limit=2" + (f"&cursor={cursor}" if cursor else "")
        page = (await client.get(url, headers=auth())).json()
        seen += [i["id"] for i in page["items"]]
        pages += 1
        cursor = page["nextCursor"]
        if not cursor:
            break
    assert pages == 5
    assert len(seen) == len(set(seen)) == 9
    # createdAt desc, then id desc
    assert seen == ["n-008", "n-007", "n-006", "n-005", "n-004", "n-003", "n-002", "n-001", "n-000"]


async def test_limit_bounds_and_bad_cursor(client):
    for bad in ("0", "101", "abc"):
        r = await client.get(f"/v1/notifications?limit={bad}", headers=auth())
        assert r.status_code == 422
    r = await client.get("/v1/notifications?cursor=!!!", headers=auth())
    assert r.status_code == 422 and r.json()["code"] == "VALIDATION_FAILED"
    page = (await client.get("/v1/notifications?limit=100", headers=auth())).json()
    assert page["nextCursor"] is None


async def test_stats(client):
    items = [
        imported_notification(1, "2026-10-01T08:00:00.000Z", category="REMINDER"),
        imported_notification(
            2, "2026-10-01T23:59:59.000Z", category="REMINDER", readBy=["user-1"]
        ),
        imported_notification(3, "2026-10-02T00:00:00.000Z", category="CONFLICT"),
        imported_notification(4, "2026-10-05T12:00:00.000Z", category="SYSTEM"),
        imported_notification(5, "2026-09-15T12:00:00.000Z", category="SYSTEM"),
        imported_notification(6, "2026-10-02T09:00:00.000Z", category="DELAY", userId="user-2"),
    ]
    await client.post(
        "/v1/admin/import", headers=auth(scope="admin"), json={"notifications": items}
    )
    r = await client.get("/v1/notifications/stats?from=2026-10-01&to=2026-10-02", headers=auth())
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 3
    by_cat = {c["category"]: c for c in body["byCategory"]}
    assert by_cat["REMINDER"] == {"category": "REMINDER", "count": 2, "unread": 1}
    assert by_cat["CONFLICT"]["count"] == 1 and "DELAY" not in by_cat
    assert body["byDay"] == [
        {"date": "2026-10-01", "count": 2},
        {"date": "2026-10-02", "count": 1},
    ]
    assert body["from"] == "2026-10-01T00:00:00.000Z"


async def test_stats_validation(client):
    r = await client.get("/v1/notifications/stats?from=2026-10-05&to=2026-10-01", headers=auth())
    assert r.status_code == 422
    r = await client.get("/v1/notifications/stats?from=yesterday", headers=auth())
    assert r.status_code == 422
    r = await client.get("/v1/notifications/stats?from=2020-01-01&to=2026-01-01", headers=auth())
    assert r.status_code == 422
    default = await client.get("/v1/notifications/stats", headers=auth())
    assert default.status_code == 200 and default.json()["total"] == 0


async def test_indexes_exist_including_ttl(client, db):
    info = await db["notifications"].index_information()
    ttl = [v for v in info.values() if "expireAfterSeconds" in v]
    assert len(ttl) == 1
    assert ttl[0]["expireAfterSeconds"] == 90 * 24 * 3600
    assert ttl[0]["key"] == [("createdAt", 1)]
    assert any(v.get("unique") and v["key"] == [("dedupeKey", 1)] for v in info.values())
    assert any(
        v["key"] == [("clinicId", 1), ("userId", 1), ("createdAt", -1), ("_id", -1)]
        for v in info.values()
    )
    conv = await db["conversations"].index_information()
    assert any(
        v["key"] == [("clinicId", 1), ("memberIds", 1), ("updatedAt", -1)] for v in conv.values()
    )
    msg = await db["messages"].index_information()
    keys = [v["key"] for v in msg.values()]
    assert [("conversationId", 1), ("createdAt", -1), ("_id", -1)] in keys
    assert [("clinicId", 1), ("createdAt", -1)] in keys


async def test_created_at_is_utc_iso(client):
    before = datetime.now(UTC).replace(microsecond=0)
    await client.post("/v1/notifications", headers=auth(), json=notification("time"))
    item = (await client.get("/v1/notifications", headers=auth())).json()["items"][0]
    created = datetime.fromisoformat(item["createdAt"])
    assert created.tzinfo is not None and created >= before


# ------------------------------------------------------------------ read-all watermark


async def _tick():
    await asyncio.sleep(0.02)  # watermark and createdAt have millisecond precision


async def test_read_all_is_a_watermark_not_a_document_update(client, db):
    for i in range(3):
        await client.post("/v1/notifications", headers=auth(), json=notification(f"w{i}"))
    await _tick()
    r = await client.post("/v1/notifications/read-all", headers=auth(sub="user-1"))
    assert r.json() == {"updated": 3}
    # no notification document was touched
    assert await db["notifications"].count_documents({"readBy": {"$ne": []}}) == 0
    mark = await db["notification_reads"].find_one({"_id": "clinic-a:user-1"})
    assert mark["clinicId"] == "clinic-a" and mark["userId"] == "user-1" and mark["readAllAt"]
    page = (await client.get("/v1/notifications", headers=auth(sub="user-1"))).json()
    assert all(i["read"] for i in page["items"]) and page["unreadCount"] == 0
    unread = await client.get("/v1/notifications?unread=true", headers=auth(sub="user-1"))
    assert unread.json()["items"] == []
    # other users are unaffected
    other = (await client.get("/v1/notifications", headers=auth(sub="user-2"))).json()
    assert other["unreadCount"] == 3 and not any(i["read"] for i in other["items"])


async def test_notification_created_after_read_all_is_unread(client):
    await client.post("/v1/notifications", headers=auth(), json=notification("old"))
    await _tick()
    await client.post("/v1/notifications/read-all", headers=auth(sub="user-1"))
    await _tick()
    await client.post("/v1/notifications", headers=auth(), json=notification("new"))
    h = auth(sub="user-1")
    count = await client.get("/v1/notifications/unread-count", headers=h)
    assert count.json() == {"count": 1, "capped": False}
    unread = (await client.get("/v1/notifications?unread=true", headers=h)).json()
    assert len(unread["items"]) == 1 and unread["items"][0]["read"] is False
    full = (await client.get("/v1/notifications", headers=h)).json()
    assert [i["read"] for i in full["items"]] == [False, True]  # newest first
    assert (await client.post("/v1/notifications/read-all", headers=h)).json() == {"updated": 1}
    assert (await client.post("/v1/notifications/read-all", headers=h)).json() == {"updated": 0}


async def test_individual_read_before_and_after_watermark(client, db):
    a = (await client.post("/v1/notifications", headers=auth(), json=notification("a"))).json()
    b = (await client.post("/v1/notifications", headers=auth(), json=notification("b"))).json()
    h = auth(sub="user-1")
    await client.post(f"/v1/notifications/{a['id']}/read", headers=h)  # before the watermark
    await _tick()
    assert (await client.post("/v1/notifications/read-all", headers=h)).json() == {"updated": 1}
    # covered by the watermark: accepted, nothing written
    assert (await client.post(f"/v1/notifications/{b['id']}/read", headers=h)).status_code == 200
    assert (await db["notifications"].find_one({"_id": b["id"]}))["readBy"] == []
    # created after the watermark: an individual read still works
    await _tick()
    c = (await client.post("/v1/notifications", headers=auth(), json=notification("c"))).json()
    count = await client.get("/v1/notifications/unread-count", headers=h)
    assert count.json()["count"] == 1
    await client.post(f"/v1/notifications/{c['id']}/read", headers=h)
    count = await client.get("/v1/notifications/unread-count", headers=h)
    assert count.json()["count"] == 0
    assert (await db["notifications"].find_one({"_id": c["id"]}))["readBy"] == ["user-1"]


async def test_unread_count_is_capped_at_100(client):
    items = [notification(f"cap{i}") for i in range(100)]
    await client.post("/v1/notifications/bulk", headers=auth(), json={"items": items})
    h = auth(sub="user-1")
    r = (await client.get("/v1/notifications/unread-count", headers=h)).json()
    assert r == {"count": 100, "capped": True}
    extra = [notification(f"cap-extra{i}") for i in range(20)]
    await client.post("/v1/notifications/bulk", headers=auth(), json={"items": extra})
    r = (await client.get("/v1/notifications/unread-count", headers=h)).json()
    assert r == {"count": 100, "capped": True}
    page = (await client.get("/v1/notifications?limit=1", headers=h)).json()
    assert page["unreadCount"] == 100
    await _tick()
    assert (await client.post("/v1/notifications/read-all", headers=h)).json() == {"updated": 100}
    r = (await client.get("/v1/notifications/unread-count", headers=h)).json()
    assert r == {"count": 0, "capped": False}


async def test_just_below_the_cap_is_not_capped(client):
    items = [notification(f"nc{i}") for i in range(99)]
    await client.post("/v1/notifications/bulk", headers=auth(), json={"items": items})
    r = (await client.get("/v1/notifications/unread-count", headers=auth(sub="user-1"))).json()
    assert r == {"count": 99, "capped": False}


async def test_watermarks_are_isolated_per_clinic_and_user(client, db):
    await client.post("/v1/notifications", headers=auth("clinic-a"), json=notification("ta"))
    await client.post("/v1/notifications", headers=auth("clinic-b"), json=notification("tb"))
    await _tick()
    r = await client.post("/v1/notifications/read-all", headers=auth("clinic-a", "user-1"))
    assert r.json() == {"updated": 1}
    other = await client.get("/v1/notifications/unread-count", headers=auth("clinic-b", "user-1"))
    assert other.json() == {"count": 1, "capped": False}
    assert await db["notification_reads"].count_documents({}) == 1
    assert (await db["notification_reads"].find_one({}))["_id"] == "clinic-a:user-1"


async def test_stats_unread_honours_watermark(client):
    await client.post("/v1/notifications", headers=auth(), json=notification("s1"))
    await _tick()
    await client.post("/v1/notifications/read-all", headers=auth(sub="user-1"))
    await _tick()
    await client.post("/v1/notifications", headers=auth(), json=notification("s2"))
    r = await client.get("/v1/notifications/stats", headers=auth(sub="user-1"))
    cat = r.json()["byCategory"][0]
    assert cat["count"] == 2 and cat["unread"] == 1


async def test_import_reads_and_reset(client):
    admin = auth(scope="admin")
    items = [
        imported_notification(1, "2026-10-01T08:00:00.000Z"),
        imported_notification(2, "2026-10-03T08:00:00.000Z"),
    ]
    payload = {
        "notifications": items,
        "reads": [{"userId": "user-1", "readAllAt": "2026-10-02T00:00:00Z"}],
    }
    r = await client.post("/v1/admin/import", headers=admin, json=payload)
    assert r.json()["reads"] == 1
    h = auth(sub="user-1")
    assert (await client.get("/v1/notifications/unread-count", headers=h)).json()["count"] == 1
    reset = await client.post("/v1/admin/reset", headers=admin)
    assert reset.json()["reads"] == 1
    assert (await client.get("/v1/notifications/unread-count", headers=h)).json()["count"] == 0


async def test_unread_query_uses_the_compound_index(client, db):
    flt = {
        "clinicId": "clinic-a",
        "userId": {"$in": ["user-1", None]},
        "readBy": {"$ne": "user-1"},
        "createdAt": {"$gt": datetime(2026, 10, 1, tzinfo=UTC)},
    }
    out = await db.command(
        {"explain": {"count": "notifications", "query": flt}, "verbosity": "queryPlanner"}
    )
    assert "clinic_user_created" in str(out["queryPlanner"]["winningPlan"])
