// Expected Moves Client
(function() {
type ExpectedMoveRow = {
  Symbol: string;
  ExpiryType: string;
  ExpiryDate: string;
  CurrentPrice?: number | null;
  IV: number;
  ClosingPrice: number;
  Delta: number;
  OneSigmaHigh: number;
  OneSigmaLow: number;
  TwoSigmaHigh: number;
  TwoSigmaLow: number;
  LastUpdated: string;
  QuoteLastUpdated?: string | null;
};

type SortDirection = 'asc' | 'desc';
type ColumnKey = keyof ExpectedMoveRow;

type SortState = {
  key: ColumnKey;
  direction: SortDirection;
};

type ExpectedMovesApiResponse = {
  asOf: string;
  expectedMoves: ExpectedMoveRow[];
  sort: SortState;
  symbols: string[];
};

type ColumnConfig = {
  key: ColumnKey;
  label: string;
  dataType: 'number' | 'string' | 'date';
  formatter?: (row: ExpectedMoveRow) => string;
  isNumeric?: boolean;
};

const REQUEST_ENDPOINT = '/request/expectedMoves';

let currentSort: SortState = {
  key: 'Symbol',
  direction: 'asc'
};

let currentInitialValue: 'initial' | 'latest' = 'initial';
let currentExpiryType: string = 'DAILY';
let currentSymbol: string = '';
let spinnerTimeout: number | null = null;

const showSpinner = (message: string) => {
  if (spinnerTimeout) {
    clearTimeout(spinnerTimeout);
  }
  spinnerTimeout = window.setTimeout(() => {
    const root = document.querySelector('[data-expected-moves-table-root]');
    if (root) {
      root.innerHTML = `
        <div class="text-center py-5">
          <div class="spinner-border text-primary" role="status">
            <span class="visually-hidden">Loading...</span>
          </div>
          <div class="mt-3 text-muted">${message}</div>
        </div>
      `;
    }
    spinnerTimeout = null;
  }, 250);
};

const hideSpinner = () => {
  if (spinnerTimeout) {
    clearTimeout(spinnerTimeout);
    spinnerTimeout = null;
  }
};

const refreshExpectedMoves = async (): Promise<void> => {
  const response = await fetch(`${REQUEST_ENDPOINT}/refresh`, {
    method: 'POST'
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to refresh expected moves');
  }
};

const numberFormatter = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const percentFormatter = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  style: 'percent'
});

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  weekday: 'short',
  year: 'numeric',
  month: 'short',
  day: 'numeric'
});

const dateTimeFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  dateStyle: 'medium',
  timeStyle: 'short'
});

const formatCurrency = (value: number): string => {
  return `$${numberFormatter.format(value)}`;
};

const formatPercent = (value: number): string => {
  return `${numberFormatter.format(value * 100)}%`;
};

const formatDate = (dateStr: string): string => {
  if (!dateStr) return '';
  // Parse date as Eastern time by appending 'T12:00:00' to ensure correct date display
  // Database stores dates in Eastern time, so we interpret the date string as Eastern noon
  const date = new Date(dateStr + 'T12:00:00');
  return dateFormatter.format(date);
};

const formatDateTime = (dateStr: string): string => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return dateTimeFormatter.format(date);
};

const formatHeaderLabel = (label: string): string => {
  const parts = label.trim().split(/\s+/);
  if (parts.length === 2) {
    return `${parts[0]}<br>${parts[1]}`;
  }
  return label;
};

const columns: ColumnConfig[] = [
  { key: 'Symbol', label: 'Symbol', dataType: 'string' },
  { key: 'ExpiryType', label: 'Expiry Type', dataType: 'string' },
  { key: 'ExpiryDate', label: 'Expiry Date', dataType: 'date', formatter: (row) => formatDate(row.ExpiryDate) },
  { key: 'CurrentPrice', label: 'Current Price', dataType: 'number', formatter: (row) => row.CurrentPrice != null ? formatCurrency(row.CurrentPrice) : '', isNumeric: true },
  { key: 'OneSigmaHigh', label: 'Expected High', dataType: 'number', formatter: (row) => formatCurrency(row.OneSigmaHigh), isNumeric: true },
  { key: 'OneSigmaLow', label: 'Expected Low', dataType: 'number', formatter: (row) => formatCurrency(row.OneSigmaLow), isNumeric: true },
  { key: 'TwoSigmaHigh', label: '2σ High', dataType: 'number', formatter: (row) => formatCurrency(row.TwoSigmaHigh), isNumeric: true },
  { key: 'TwoSigmaLow', label: '2σ Low', dataType: 'number', formatter: (row) => formatCurrency(row.TwoSigmaLow), isNumeric: true },
  { key: 'IV', label: 'IV (%)', dataType: 'number', formatter: (row) => formatPercent(row.IV), isNumeric: true },
  { key: 'ClosingPrice', label: 'Closing Price', dataType: 'number', formatter: (row) => formatCurrency(row.ClosingPrice), isNumeric: true },
  { key: 'LastUpdated', label: 'Last Updated', dataType: 'date', formatter: (row) => formatDateTime(row.LastUpdated) }
];

const deleteSymbol = async (symbol: string): Promise<void> => {
  const response = await fetch(`${REQUEST_ENDPOINT}/${encodeURIComponent(symbol)}`, {
    method: 'DELETE'
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to delete symbol');
  }
};

const fetchExpectedMoves = async (): Promise<ExpectedMovesApiResponse> => {
  const params = new URLSearchParams({
    sortKey: currentSort.key,
    sortDirection: currentSort.direction,
    initialValue: currentInitialValue,
    expiryTypes: currentExpiryType
  });
  if (currentSymbol && currentSymbol.length > 0) {
    params.set('symbol', currentSymbol);
  }

  const response = await fetch(`${REQUEST_ENDPOINT}?${params}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch expected moves: ${response.statusText}`);
  }
  return response.json();
};

const handleSort = (key: ColumnKey) => {
  if (currentSort.key === key) {
    currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
  } else {
    currentSort.key = key;
    currentSort.direction = 'asc';
  }
  renderTable();
};

const renderTable = async () => {
  const root = document.querySelector('[data-expected-moves-table-root]');
  if (!root) return;

  showSpinner('Loading...');
  try {
    const data = await fetchExpectedMoves();
    hideSpinner();

    // Populate symbol dropdown with the full list from server
    populateSymbolDropdown(data.symbols || []);
    
    // Build rows to render from the returned expected moves, but ensure every registered
    // symbol is present — if a symbol had no data, add a synthetic no-data row so the UI
    // shows it with a 'No data available' message.
    let rowsToRender: ExpectedMoveRow[] = (data.expectedMoves || []).slice();
    if (data.symbols && data.symbols.length > 0) {
      const existing = new Set(rowsToRender.map(r => (r.Symbol || '').toUpperCase()));
      data.symbols.forEach(sym => {
        if (!existing.has(sym.toUpperCase())) {
          rowsToRender.push({
            Symbol: sym,
            ExpiryType: '',
            ExpiryDate: '',
            IV: 0,
            ClosingPrice: 0,
            Delta: 0,
            OneSigmaHigh: 0,
            OneSigmaLow: 0,
            TwoSigmaHigh: 0,
            TwoSigmaLow: 0,
            LastUpdated: ''
          });
        }
      });
    }

    // If a specific symbol is selected, only show rows for that symbol. Otherwise show all registered symbols.
    if (currentSymbol && currentSymbol.length > 0) {
      const sel = currentSymbol.toUpperCase();
      rowsToRender = rowsToRender.filter(r => (r.Symbol || '').toUpperCase() === sel);
    }

    if (!rowsToRender || rowsToRender.length === 0) {
      root.innerHTML = '<p class="text-muted text-center py-4">No expected moves data available.</p>';
      return;
    }

    const table = document.createElement('table');
    table.className = 'table table-sm table-hover';

    // Table header
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    
    columns.forEach(col => {
      const th = document.createElement('th');
      th.className = col.dataType === 'date' ? 'text-start' : 'text-center';
      th.style.cursor = 'pointer';
      th.style.userSelect = 'none';
      
      const sortIcon = currentSort.key === col.key
        ? currentSort.direction === 'asc'
          ? ' ▲'
          : ' ▼'
        : '';
      
      th.innerHTML = `${formatHeaderLabel(col.label)}${sortIcon}`;
      th.addEventListener('click', () => handleSort(col.key));
      headerRow.appendChild(th);
    });
    
    // Add empty header for delete column
    const deleteHeaderTh = document.createElement('th');
    deleteHeaderTh.style.width = '1%';
    deleteHeaderTh.style.whiteSpace = 'nowrap';
    headerRow.appendChild(deleteHeaderTh);
    
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Table body
    const tbody = document.createElement('tbody');
    
    rowsToRender.forEach(row => {
      const tr = document.createElement('tr');
      tr.setAttribute('data-symbol', row.Symbol);
      
      // Check if this row has no data (ExpiryType will be empty if no ExpectedMoves data exists)
      const hasNoData = !row.ExpiryType;
      
      if (hasNoData) {
        // Render Symbol column
        const symbolTd = document.createElement('td');
        symbolTd.className = 'text-center';
        symbolTd.textContent = row.Symbol;
        tr.appendChild(symbolTd);
        
        // Render spanning cell for remaining columns with no-data message
        const pendingTd = document.createElement('td');
        pendingTd.colSpan = columns.length - 1;
        pendingTd.className = 'text-center text-muted fst-italic';
        pendingTd.textContent = 'No data available';
        tr.appendChild(pendingTd);
      } else {
        columns.forEach(col => {
          const td = document.createElement('td');
          td.className = col.dataType === 'date' ? 'text-start' : 'text-center';
          const value = col.formatter ? col.formatter(row) : String(row[col.key]);
          td.textContent = value;
          tr.appendChild(td);
        });
      }
      
      // Add delete button column
      const deleteTd = document.createElement('td');
      deleteTd.style.whiteSpace = 'nowrap';
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'btn btn-sm btn-danger delete-btn';
      deleteBtn.title = 'Delete';
      deleteBtn.innerHTML = '<i class="fa-solid fa-trash" aria-hidden="true"></i>';
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const symbol = row.Symbol;
        const messageEl = document.getElementById('expected-moves-delete-message');
        if (messageEl) {
          messageEl.textContent = `Are you sure you want to delete "${symbol}"?`;
        }
        (window as any)._pendingDeleteSymbol = symbol;
        
        const modalEl = document.getElementById('expectedMovesDeleteModal');
        if (modalEl) {
          const modal = (window as any).bootstrap.Modal.getOrCreateInstance(modalEl);
          modal.show();
        }
      });
      deleteTd.appendChild(deleteBtn);
      tr.appendChild(deleteTd);
      
      tbody.appendChild(tr);
    });
    
    table.appendChild(tbody);
    root.innerHTML = '';
    root.appendChild(table);

    // Update top-right 'Quotes as of' display (like Trades/PlaceOrders pages)
    const serverQuotesAsOf = (data as any).asOf as string | null | undefined;
    const dateDisplay = document.getElementById('expected-moves-date-display');
    if (dateDisplay) {
      if (serverQuotesAsOf) {
        const etFormatter = new Intl.DateTimeFormat('en-US', {
          weekday: 'short',
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          timeZone: 'America/New_York'
        });
        const d = new Date(serverQuotesAsOf);
        const rendered = etFormatter.format(d);
        dateDisplay.innerHTML = `<em>Quotes as of ${rendered}</em>`;
      } else {
        // Fallback guidance when quotes are not available
        dateDisplay.innerHTML = `<em>Current quotes are not available. Click Refresh Quotes.</em>`;
      }
    }

  } catch (error) {
    hideSpinner();
    console.error('Error rendering expected moves table:', error);
    root.innerHTML = '<p class="text-danger text-center py-4">Error loading expected moves data.</p>';
  }
};

const populateSymbolDropdown = (symbols: string[]) => {
  const selectEl = document.getElementById('expected-moves-symbol-filter') as HTMLSelectElement | null;
  if (!selectEl) return;
  const selected = selectEl.value || '';
  // Clear existing options and re-add
  selectEl.innerHTML = '';
  const allOpt = document.createElement('option');
  allOpt.value = '';
  allOpt.textContent = 'All';
  selectEl.appendChild(allOpt);
  symbols.forEach(sym => {
    const opt = document.createElement('option');
    opt.value = sym;
    opt.textContent = sym;
    selectEl.appendChild(opt);
  });
  selectEl.value = selected;
};

const initializeFilters = () => {
  // Initial Value filter
  const initialValueButtons = document.querySelectorAll('[data-filter="initial-value"]');
  initialValueButtons.forEach(button => {
    button.addEventListener('click', () => {
      initialValueButtons.forEach(btn => btn.classList.remove('active'));
      button.classList.add('active');
      currentInitialValue = button.getAttribute('data-value') as 'initial' | 'latest';
      renderTable();
    });
  });

  // Expiry Type filter - single select
  const expiryTypeButtons = document.querySelectorAll('[data-filter="expiry-type"]');
  expiryTypeButtons.forEach(button => {
    button.addEventListener('click', () => {
      const value = button.getAttribute('data-value');
      if (!value) return;
      
      // Deactivate all buttons, then activate only the clicked one
      expiryTypeButtons.forEach(btn => btn.classList.remove('active'));
      button.classList.add('active');
      
      currentExpiryType = value;
      renderTable();
    });
  });

  // Symbol dropdown handler
  const symbolSelect = document.getElementById('expected-moves-symbol-filter') as HTMLSelectElement | null;
  if (symbolSelect) {
    symbolSelect.addEventListener('change', () => {
      currentSymbol = symbolSelect.value || '';
      renderTable();
    });
  }

  // Refresh Quotes button: call importQuotes and reload the table when complete
  document.getElementById('refresh-quotes')?.addEventListener('click', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('refresh-quotes') as HTMLButtonElement;
    if (!btn) return;
    btn.disabled = true;
    const originalHtml = btn.innerHTML;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>';
    try {
      const response = await fetch('/request/importQuotes', { method: 'POST' });
      const result = await response.json();
      await renderTable();
      if (!result.success && result.error) {
        (window as any).LumosErrorUtils.displayDismissibleError(document.body, result.error, 'Refresh Quotes completed with errors');
      } else if (result.refreshErrors) {
        (window as any).LumosErrorUtils.displayDismissibleError(document.body, result.refreshErrors, 'Refresh Quotes completed with errors');
      }
    } catch (err) {
      console.error('Failed to refresh quotes:', err);
      (window as any).LumosErrorUtils.displayDismissibleError(document.body, 'Failed to refresh quotes', 'Refresh Quotes failed');
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    }
  });
};

document.addEventListener('DOMContentLoaded', () => {
  initializeFilters();
  renderTable();
  const resetTitle = document.querySelector('[data-reset-expected-moves]');
  if (resetTitle) {
    resetTitle.addEventListener('click', () => {
      // Reset sort
      currentSort = { key: 'Symbol', direction: 'asc' };

      // Reset filters
      currentInitialValue = 'initial';
      currentExpiryType = 'DAILY';
      currentSymbol = '';

      // Update UI button states
      const initialButtons = document.querySelectorAll('[data-filter="initial-value"]');
      initialButtons.forEach(btn => btn.classList.remove('active'));
      const initialDefault = document.querySelector('[data-filter="initial-value"][data-value="initial"]');
      if (initialDefault) initialDefault.classList.add('active');

      const expiryButtons = document.querySelectorAll('[data-filter="expiry-type"]');
      expiryButtons.forEach(btn => btn.classList.remove('active'));
      const expiryDefault = document.querySelector('[data-filter="expiry-type"][data-value="DAILY"]');
      if (expiryDefault) expiryDefault.classList.add('active');

      const symbolSelect = document.getElementById('expected-moves-symbol-filter') as HTMLSelectElement | null;
      if (symbolSelect) symbolSelect.value = '';

      renderTable();
    });
  }

  // Add Symbol modal wiring
  const addButton = document.getElementById('addExpectedMoveSymbolButton');
  const modalEl = document.getElementById('addExpectedMoveSymbolModal');
  const inputEl = document.getElementById('addExpectedMoveSymbolInput') as HTMLInputElement | null;
  const errorEl = document.getElementById('addExpectedMoveSymbolError');
  const confirmBtn = document.getElementById('confirmAddExpectedMoveSymbol');

  const showError = (msg: string) => {
    if (!errorEl) return;
    errorEl.textContent = msg;
    errorEl.classList.remove('d-none');
  };

  const clearError = () => {
    if (!errorEl) return;
    errorEl.textContent = '';
    errorEl.classList.add('d-none');
  };

  const openModal = () => {
    if (!modalEl) return;
    clearError();
    if (inputEl) {
      inputEl.value = '';
      setTimeout(() => inputEl.focus(), 150);
    }
    const modal = (window as any).bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();
  };

  const closeModal = () => {
    if (!modalEl) return;
    const modal = (window as any).bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.hide();
  };

  const addSymbol = async (symbolRaw: string) => {
    const symbol = (symbolRaw || '').trim().toUpperCase();
    if (!symbol) {
      showError('Please enter a symbol.');
      return;
    }
    // Validate only A-Z characters
    if (!/^[A-Z]+$/.test(symbol)) {
      showError('Symbol must contain only letters (A-Z).');
      return;
    }
    // Check for duplicates in current table
    const existingRows = document.querySelectorAll('[data-symbol]');
    const existingSymbols = Array.from(existingRows).map(row => 
      row.getAttribute('data-symbol')?.toUpperCase()
    );
    if (existingSymbols.includes(symbol)) {
      showError(`Symbol "${symbol}" already exists.`);
      return;
    }
    try {
      const resp = await fetch(REQUEST_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol })
      });
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(text || 'Failed to add symbol');
      }
      closeModal();
      renderTable();
    } catch (err: any) {
      showError(err?.message || 'Failed to add symbol');
    }
  };

  if (addButton) {
    addButton.addEventListener('click', openModal);
  }
  if (confirmBtn) {
    confirmBtn.addEventListener('click', () => addSymbol(inputEl ? inputEl.value : ''));
  }
  if (inputEl) {
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addSymbol(inputEl.value);
      }
    });
  }

  // Delete confirmation handler
  const confirmDeleteBtn = document.getElementById('expected-moves-confirm-delete');
  if (confirmDeleteBtn) {
    confirmDeleteBtn.addEventListener('click', async () => {
      const symbol = (window as any)._pendingDeleteSymbol;
      if (!symbol) return;
      try {
        await deleteSymbol(symbol);
        const modalEl = document.getElementById('expectedMovesDeleteModal');
        if (modalEl) {
          const modal = (window as any).bootstrap.Modal.getOrCreateInstance(modalEl);
          modal.hide();
        }
        renderTable();
      } catch (error: any) {
        console.error('Delete failed:', error);
        alert(error?.message || 'Failed to delete symbol');
      } finally {
        (window as any)._pendingDeleteSymbol = null;
      }
    });
  }

  // Refresh button handler
  const refreshButton = document.getElementById('refreshExpectedMovesButton');
  const refreshModalEl = document.getElementById('expectedMovesRefreshModal');
  if (refreshButton && refreshModalEl) {
    refreshButton.addEventListener('click', () => {
      const modal = (window as any).bootstrap.Modal.getOrCreateInstance(refreshModalEl);
      modal.show();
    });
  }

  // Refresh confirmation handler
  const confirmRefreshBtn = document.getElementById('expected-moves-confirm-refresh');
  if (confirmRefreshBtn && refreshModalEl) {
    confirmRefreshBtn.addEventListener('click', async () => {
      const modal = (window as any).bootstrap.Modal.getOrCreateInstance(refreshModalEl);
      modal.hide();
      showSpinner('Refreshing expected moves...');
      try {
        await refreshExpectedMoves();
        hideSpinner();
        renderTable();
      } catch (error: any) {
        hideSpinner();
        console.error('Refresh failed:', error);
        alert(error?.message || 'Failed to refresh expected moves');
      }
    });
  }
});

})();
