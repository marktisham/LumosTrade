(function() {
  const ROW_COUNT_CLASS = 'table-rows-displayed';

  const renderRowCount = (container: HTMLElement, count: number, label: string = 'displayed') => {
    // Remove existing if count is zero
    if (!container) return;
    const existing = container.querySelector('.' + ROW_COUNT_CLASS) as HTMLElement | null;
    if (count <= 0) {
      if (existing) existing.remove();
      return;
    }

    let el = existing;
    if (!el) {
      el = document.createElement('p');
      el.className = `text-muted small mt-3 mb-0 ${ROW_COUNT_CLASS}`;
      container.appendChild(el);
    }
    el.textContent = `${count} ${count === 1 ? 'row' : 'rows'} ${label}.`; // lower-case per spec
  };

  // Expose via the global window object so existing client files do not need import changes
  (window as any).__renderRowCount = renderRowCount;
})();