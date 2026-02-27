import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { CreateClientDrawer } from '../src/components/create-client/CreateClientDrawer';
import { ToastProvider } from '../src/context/ToastContext';

describe('CreateClientDrawer', () => {
  it('shows fixed investor profile on step 3', async () => {
    const user = userEvent.setup();

    render(
      <ToastProvider>
        <CreateClientDrawer
          forms={[
            {
              id: 'form_1',
              code: 'INVESTOR_PROFILE',
              title: 'Investor-Profile'
            }
          ]}
          open
          primaryBroker={{ id: 'user_1', name: 'Advisor One', email: 'advisor@example.com' }}
          onClientCreated={vi.fn()}
          onClose={vi.fn()}
        />
      </ToastProvider>
    );

    await user.type(screen.getByPlaceholderText('Enter full name'), 'John Smith');
    await user.type(screen.getByPlaceholderText('name@example.com'), 'john@example.com');

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Primary Locked Broker')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next' }));

    expect(screen.getByText('Selected Form')).toBeInTheDocument();
    expect(screen.getByText('Investor-Profile')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create Client' })).toBeInTheDocument();
  });
});
