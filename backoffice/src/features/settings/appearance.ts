import { useEffect } from 'react';
import { type ClinicSettingsDto } from '@riaya/shared';
import { useAuth } from '../../auth/AuthContext';
import { useSettingsQuery } from './api';
import './appearance.css';
import { canUser } from '../../auth/permissions';

export type Appearance = ClinicSettingsDto['appearance'];

const STORAGE_KEY = 'riaya.appearance';

/** Write the preferences to data attributes on <html>; the CSS in appearance.css reads them. */
export function applyAppearance(appearance: Appearance | null | undefined): void {
  const root = document.documentElement;
  if (!appearance) {
    delete root.dataset.density;
    delete root.dataset.contrast;
    delete root.dataset.motion;
    return;
  }
  root.dataset.density = appearance.density;
  if (appearance.highContrast) root.dataset.contrast = 'high';
  else delete root.dataset.contrast;
  if (appearance.reduceMotion) root.dataset.motion = 'reduce';
  else delete root.dataset.motion;
}

export function loadStoredAppearance(): Appearance | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Appearance) : null;
  } catch {
    return null;
  }
}

export function storeAppearance(appearance: Appearance): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(appearance));
  } catch {
    /* storage unavailable: the preference then lasts for this session only */
  }
}

/**
 * Applies the saved appearance on every authenticated screen: the stored copy first (any
 * role), refreshed from the clinic settings for administrators.
 */
export function useAppearanceBootstrap(): void {
  const { user } = useAuth();
  const admin = canUser(user, 'manageSettings');
  const { data } = useSettingsQuery(undefined, { skip: !admin });

  useEffect(() => {
    applyAppearance(loadStoredAppearance());
  }, []);

  useEffect(() => {
    if (data?.appearance) {
      applyAppearance(data.appearance);
      storeAppearance(data.appearance);
    }
  }, [data?.appearance]);
}
