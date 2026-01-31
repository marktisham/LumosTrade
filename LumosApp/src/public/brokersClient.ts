// Client-side logic for the brokers page

let isResyncInProgress = false;

function initETradeAuth(): void {
  const authButton = document.getElementById('etradeAuthButton') as HTMLButtonElement | null;
  const verificationForm = document.getElementById('etradeVerificationForm') as HTMLElement | null;
  const verificationCodeInput = document.getElementById('etradeVerificationCode') as HTMLInputElement | null;
  const submitCodeButton = document.getElementById('etradeSubmitCodeButton') as HTMLButtonElement | null;

  if (!authButton || !verificationForm || !verificationCodeInput || !submitCodeButton) {
    console.error('E*TRADE auth elements not found');
    return;
  }

  // Handle auth button click - initiate OAuth1 flow
  authButton.addEventListener('click', async () => {
    authButton.disabled = true;
    authButton.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Initiating...';

    try {
      const response = await fetch('/request/brokers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ action: 'etrade-initiate-auth' })
      });

      const result = await response.json();

      if (result.success && result.authUrl) {
        // Open E*TRADE authorization in a new tab
        window.open(result.authUrl, '_blank');
        
        // Hide error alert if present
        const errorAlert = document.getElementById('etradeErrorAlert');
        if (errorAlert) {
          errorAlert.style.display = 'none';
        }
        
        // Show verification code form
        verificationForm.style.display = 'block';
        authButton.innerHTML = '<i class="fa-solid fa-key me-2"></i>Authorization In Progress...';
        verificationCodeInput.focus();
      } else {
        throw new Error(result.error || 'Failed to initiate authorization');
      }
    } catch (error) {
      console.error('Failed to initiate E*TRADE auth:', error);
      alert(`Failed to initiate authorization: ${error instanceof Error ? error.message : String(error)}`);
      authButton.disabled = false;
      authButton.innerHTML = '<i class="fa-solid fa-key me-2"></i>Authorize E*TRADE API';
    }
  });

  // Handle verification code submission
  submitCodeButton.addEventListener('click', async () => {
    const verificationCode = verificationCodeInput.value.trim();

    if (!verificationCode) {
      alert('Please enter the verification code from E*TRADE');
      return;
    }

    submitCodeButton.disabled = true;
    submitCodeButton.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Submitting...';

    try {
      const response = await fetch('/request/brokers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'etrade-complete-auth',
          verificationCode: verificationCode
        })
      });

      const result = await response.json();

      if (result.success) {
        // Success - reload the page to show updated status
        window.location.reload();
      } else {
        throw new Error(result.error || 'Failed to complete authorization');
      }
    } catch (error) {
      console.error('Failed to complete E*TRADE auth:', error);
      alert(`Failed to complete authorization: ${error instanceof Error ? error.message : String(error)}`);
      submitCodeButton.disabled = false;
      submitCodeButton.innerHTML = '<i class="fa-solid fa-check me-2"></i>Submit Code';
    }
  });

  // Allow Enter key to submit verification code
  verificationCodeInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      submitCodeButton.click();
    }
  });
}

function initFullResync(): void {
  const resyncButton = document.getElementById('fullResyncButton') as HTMLButtonElement | null;
  const spinner = document.getElementById('resyncSpinner') as HTMLElement | null;
  const statusDiv = document.getElementById('resyncStatus') as HTMLElement | null;

  if (!resyncButton || !spinner || !statusDiv) {
    console.error('Full resync elements not found');
    return;
  }

  resyncButton.addEventListener('click', async () => {
    console.log('Import Broker Data button clicked');
    if (isResyncInProgress) {
      console.log('Import already in progress, ignoring click');
      return;
    }

    isResyncInProgress = true;
    resyncButton.disabled = true;
    spinner.classList.remove('d-none');
    statusDiv.innerHTML = '';

    try {
      const response = await fetch('/request/fullResync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const result = await response.json();
      console.log('Import result:', result);

      if (result.success) {
        statusDiv.innerHTML = `
          <div class="alert alert-success d-flex align-items-center">
            <i class="fa-solid fa-check-circle me-3 fs-4"></i>
            <div>
              <strong>Success!</strong>
              <p class="mb-0 small">${result.message}</p>
            </div>
          </div>
        `;
        // If we were in zero state, reload the page as we may now have accounts
        try {
          // window.IN_ZERO_STATE is set by the server-rendered template
          if ((window as any).IN_ZERO_STATE === true || (window as any).IN_ZERO_STATE === 'true') {
            console.log('Zero state detected on client; navigating to home after import');
            window.location.href = '/home';
            return;
          }
        } catch (e) {
          console.warn('Error checking IN_ZERO_STATE:', e);
        }
      } else {
        statusDiv.innerHTML = `
          <div class="alert alert-danger d-flex align-items-center">
            <i class="fa-solid fa-exclamation-triangle me-3 fs-4"></i>
            <div>
              <strong>Error</strong>
              <p class="mb-0 small">${result.message}</p>
              ${result.error ? `<pre class="mb-0 mt-2 small">${result.error}</pre>` : ''}
            </div>
          </div>
        `;
      }
    } catch (error) {
      console.error('Full resync failed:', error);
      statusDiv.innerHTML = `
        <div class="alert alert-danger d-flex align-items-center">
          <i class="fa-solid fa-exclamation-triangle me-3 fs-4"></i>
          <div>
            <strong>Error</strong>
            <p class="mb-0 small">Failed to complete full resync: ${error instanceof Error ? error.message : String(error)}</p>
          </div>
        </div>
      `;
    } finally {
      isResyncInProgress = false;
      resyncButton.disabled = false;
      spinner.classList.add('d-none');
    }
  });
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  initETradeAuth();
  initFullResync();
});
