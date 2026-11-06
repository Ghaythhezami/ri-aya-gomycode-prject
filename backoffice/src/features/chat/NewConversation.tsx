import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../common/Button';
import { Input } from '../../common/Input';
import { Skeleton } from '../../common/Skeleton';
import { ErrorState } from '../../common/States';
import { useAuth } from '../../auth/AuthContext';
import { asClinicError } from '../../store/clinicApi';
import { Avatar } from '../shared/Avatar';
import { useChatCreateConversationMutation, useChatStaffQuery } from './api';

/** Pick colleagues from the clinic staff and start a direct or group conversation. */
export function NewConversation({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: (id: string) => void;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const staff = useChatStaffQuery();
  const [create, createState] = useChatCreateConversationMutation();
  const [selected, setSelected] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);

  const people = (staff.data ?? []).filter((p) => p.id !== user?.id);
  const toggle = (id: string) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );

  const start = async () => {
    setError(null);
    try {
      const conversation = await create({
        memberIds: selected,
        ...(selected.length > 1 && title.trim() ? { title: title.trim() } : {}),
      }).unwrap();
      onCreated(conversation.id);
    } catch (e) {
      setError(
        t(`errors.${asClinicError(e)?.code ?? 'INTERNAL_ERROR'}`, {
          defaultValue: asClinicError(e)?.message ?? '',
        }),
      );
    }
  };

  return (
    <div className="p-4">
      {staff.isLoading && (
        <div className="space-y-2" aria-busy="true">
          <Skeleton className="h-11" />
          <Skeleton className="h-11" />
        </div>
      )}
      {staff.isError && (
        <ErrorState
          title={t('chat.staffError')}
          action={
            <Button variant="secondary" onClick={() => void staff.refetch()}>
              {t('clinic.retry')}
            </Button>
          }
        />
      )}
      {staff.data && people.length === 0 && (
        <p className="text-sm text-muted">{t('chat.noStaff')}</p>
      )}
      {people.length > 0 && (
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-text">{t('chat.pickStaff')}</legend>
          <ul className="space-y-1">
            {people.map((p) => (
              <li key={p.id}>
                <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 hover:bg-bg">
                  <input
                    type="checkbox"
                    checked={selected.includes(p.id)}
                    onChange={() => toggle(p.id)}
                    className="size-4 accent-primary"
                  />
                  <Avatar initials={p.initials} size="sm" />
                  <span className="truncate text-sm text-text">{p.name}</span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      )}
      {selected.length > 1 && (
        <div className="mt-3">
          <label htmlFor="chat-title" className="mb-1.5 block text-sm font-medium text-text">
            {t('chat.groupTitle')}
          </label>
          <Input
            id="chat-title"
            value={title}
            maxLength={80}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-error">
          {error}
        </p>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          {t('clinic.cancel')}
        </Button>
        <Button
          onClick={() => void start()}
          disabled={selected.length === 0 || createState.isLoading}
        >
          {t('chat.start')}
        </Button>
      </div>
    </div>
  );
}
