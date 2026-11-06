import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import type { SelfCheckInResult } from '@riaya/shared';
import { Button } from '../../common/Button';
import { Field, Input } from '../../common/Input';
import { LanguageSwitcher } from '../../layouts/LanguageSwitcher';
import { asClinicError } from '../../store/clinicApi';
import { useSelfCheckInMutation } from './api';
import {
  selfCheckInErrorKey,
  selfCheckInSchema,
  type SelfCheckInFormInput,
  type SelfCheckInFormValues,
} from './selfCheckIn';

/** Form and result of a patient checking in from their phone. Minimal personal data. */
export function SelfCheckInView({
  onSubmit,
  result,
  error,
  busy,
  onReset,
}: {
  onSubmit: (values: SelfCheckInFormValues) => void;
  result: SelfCheckInResult | null;
  error: string | null;
  busy: boolean;
  onReset: () => void;
}) {
  const { t } = useTranslation();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SelfCheckInFormInput, unknown, SelfCheckInFormValues>({
    resolver: zodResolver(selfCheckInSchema),
    defaultValues: { appointmentCode: '', phoneLast4: '' },
  });

  if (result) {
    return (
      <div className="text-center" role="status">
        <CheckCircle2 size={40} aria-hidden="true" className="mx-auto text-success" />
        <h2 className="mt-3 text-xl font-semibold text-text">
          {t('display.checkIn.successTitle')}
        </h2>
        <p className="mt-5 text-sm text-muted">{t('display.checkIn.yourNumber')}</p>
        <p className="mt-1 text-6xl font-extrabold text-primary" dir="ltr">
          {result.number}
        </p>
        <p className="mt-4 text-base text-text">
          {t('display.checkIn.position', { count: result.position })}
        </p>
        <p className="mt-2 text-sm text-muted">{t('display.checkIn.watchScreen')}</p>
        <Button variant="secondary" className="mt-6" onClick={onReset}>
          {t('display.checkIn.another')}
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} noValidate className="space-y-4">
      <p className="text-sm text-muted">{t('display.checkIn.intro')}</p>
      <Field
        label={t('display.checkIn.code')}
        help={t('display.checkIn.codeHelp')}
        error={errors.appointmentCode?.message as string | undefined}
      >
        <Input
          dir="ltr"
          autoCapitalize="characters"
          autoComplete="off"
          placeholder="AP-1042"
          {...register('appointmentCode')}
        />
      </Field>
      <Field
        label={t('display.checkIn.phone')}
        help={t('display.checkIn.phoneHelp')}
        error={errors.phoneLast4?.message as string | undefined}
      >
        <Input
          dir="ltr"
          inputMode="numeric"
          maxLength={4}
          autoComplete="off"
          placeholder="1234"
          {...register('phoneLast4')}
        />
      </Field>
      {error && (
        <p role="alert" className="rounded-md bg-error/10 px-3 py-2 text-sm text-error">
          {error}
        </p>
      )}
      <Button
        type="submit"
        size="lg"
        className="w-full"
        disabled={busy}
        aria-busy={busy || undefined}
      >
        {t('display.checkIn.submit')}
      </Button>
    </form>
  );
}

/** Route `/check-in/:clinicId`: public, mobile first. */
export function SelfCheckInPage() {
  const { t } = useTranslation();
  const { clinicId = '' } = useParams();
  const [submit, { isLoading }] = useSelfCheckInMutation();
  const [result, setResult] = useState<SelfCheckInResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [round, setRound] = useState(0);

  const onSubmit = async (values: SelfCheckInFormValues) => {
    setError(null);
    try {
      setResult(await submit({ clinicId, body: values }).unwrap());
    } catch (raw) {
      const e = asClinicError(raw);
      setError(t(selfCheckInErrorKey(e?.status ?? 0, e?.code ?? '')));
    }
  };

  return (
    <div className="grid min-h-screen place-items-start bg-bg p-4 sm:place-items-center sm:p-6">
      <div className="w-full max-w-md rounded-lg border border-border bg-surface p-6 shadow-(--shadow-card) sm:p-8">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <img
              src={`${import.meta.env.BASE_URL}logo.png`}
              alt=""
              className="size-12 rounded-xl bg-black object-cover"
            />
            <div>
              <p className="text-xs font-semibold tracking-wide text-primary">{t('app.name')}</p>
              <h1 className="text-lg font-semibold text-text">{t('display.checkIn.title')}</h1>
            </div>
          </div>
          <LanguageSwitcher />
        </div>
        <SelfCheckInView
          key={round}
          onSubmit={(v) => void onSubmit(v)}
          result={result}
          error={error}
          busy={isLoading}
          onReset={() => {
            setResult(null);
            setError(null);
            setRound((r) => r + 1);
          }}
        />
      </div>
    </div>
  );
}
