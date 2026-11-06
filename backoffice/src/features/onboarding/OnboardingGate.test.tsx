import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { OnboardingGate } from './OnboardingGate';
import { useOnboardingStatus } from './status';
import { clearOnboardingSeen } from '../../lib/onboardingSeen';

const state = { data: { completed: false, steps: [] } as unknown };
jest.mock('./api', () => ({ useOnboardingQuery: () => ({ data: state.data }) }));

function Where() {
  const { pathname } = useLocation();
  const status = useOnboardingStatus();
  return (
    <p>
      at:{pathname} completed:{String(status?.completed)}
    </p>
  );
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <OnboardingGate>
        <Routes>
          <Route path="*" element={<Where />} />
        </Routes>
      </OnboardingGate>
    </MemoryRouter>,
  );
}

describe('OnboardingGate', () => {
  beforeEach(() => {
    clearOnboardingSeen();
    state.data = { completed: false, steps: [] };
  });

  it('sends a signed-in user with open onboarding to the wizard once', () => {
    renderAt('/patients');
    expect(screen.getByText(/at:\/onboarding/)).toBeInTheDocument();
  });

  it('does not loop: after the wizard was offered, other pages stay reachable', () => {
    const first = renderAt('/');
    expect(screen.getByText(/at:\/onboarding/)).toBeInTheDocument();
    first.unmount();
    renderAt('/patients');
    expect(screen.getByText(/at:\/patients/)).toBeInTheDocument();
  });

  it('leaves completed users alone and exposes the status', () => {
    state.data = { completed: true, steps: [] };
    renderAt('/patients');
    expect(screen.getByText('at:/patients completed:true')).toBeInTheDocument();
  });
});
