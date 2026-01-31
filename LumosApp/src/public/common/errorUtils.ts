// Shared utility for displaying dismissible error messages across all pages
// This script is loaded globally and attaches functions to window.LumosErrorUtils

(function() {
  /**
   * Displays a dismissible error alert at the top of a container
   * @param container The HTML element to insert the error into (typically at the top)
   * @param errorMessage The error message to display (supports multi-line text)
   * @param title Title for the error alert
   */
  function displayDismissibleError(
    container: HTMLElement,
    errorMessage: string,
    title: string
  ): void {
    // Remove any existing error alerts to avoid duplicates
    const existingAlerts = container.querySelectorAll('.alert-danger[data-error-alert]');
    existingAlerts.forEach(alert => alert.remove());

    const errorDiv = document.createElement('div');
    errorDiv.className = 'alert alert-danger alert-dismissible fade show';
    errorDiv.setAttribute('data-error-alert', 'true');
    errorDiv.style.whiteSpace = 'pre-wrap';

    const titleElement = document.createElement('strong');
    titleElement.textContent = title + ':';

    const messageText = document.createTextNode('\n' + errorMessage);

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'btn-close';
    closeButton.setAttribute('data-bs-dismiss', 'alert');
    closeButton.setAttribute('aria-label', 'Close');

    errorDiv.appendChild(titleElement);
    errorDiv.appendChild(messageText);
    errorDiv.appendChild(closeButton);

    container.insertBefore(errorDiv, container.firstChild);
  }

  /**
   * Clears all error alerts from a container
   * @param container The HTML element to clear errors from
   */
  function clearErrors(container: HTMLElement): void {
    const existingAlerts = container.querySelectorAll('.alert-danger[data-error-alert]');
    existingAlerts.forEach(alert => alert.remove());
  }

  // Expose to global scope
  (window as any).LumosErrorUtils = {
    displayDismissibleError,
    clearErrors
  };
})();
