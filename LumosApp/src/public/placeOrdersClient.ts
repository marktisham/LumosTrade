// Place Orders Client
(function() {

type PlaceOrderRow = {
  PlaceOrderID: number | null;
  AccountID: number;
  AccountName: string;
  BrokerOrderID: number | null;
  Symbol: string;
  Action: string;
  Price: number;
  CurrentPrice?: number | null;
  Quantity: number;
  OrderAmount: number;
  Status: string | null;
  LastUpdated: string | null;
};

type Account = {
  AccountID: number;
  Name: string;
};

type SortDirection = 'asc' | 'desc';
type ColumnKey = 'AccountName' | 'BrokerOrderID' | 'Symbol' | 'Action' | 'Price' | 'CurrentPrice' | 'Quantity' | 'OrderAmount' | 'OrderStatus' | 'LastUpdated';

type SortState = {
  key: ColumnKey;
  direction: SortDirection;
};

const DEFAULT_SORT: SortState = { key: 'Symbol', direction: 'asc' };
const REQUEST_ENDPOINT = '/request/placeOrders';

let currentSort: SortState = { ...DEFAULT_SORT };
let lastAddedOrderId: number | null = null;

const showErrorModal = (message: string) => {
  const modalEl = document.getElementById('placeOrdersErrorModal');
  const messageEl = document.getElementById('place-orders-error-message');
  if (modalEl && messageEl && (window as any).bootstrap) {
    messageEl.textContent = message;
    const modal = (window as any).bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();
  } else {
    alert(message);
  }
};

const fetchPlaceOrders = async (): Promise<PlaceOrderRow[]> => {
  const params = new URLSearchParams({
    sort: currentSort.key,
    dir: currentSort.direction,
  });

  const response = await fetch(`${REQUEST_ENDPOINT}?${params.toString()}`);
  if (!response.ok) {
    throw new Error('Failed to fetch place orders');
  }
  const json = await response.json();
  // Backwards compatible: previous API returned an array directly. New API returns { quotesAsOf, orders }
  if (Array.isArray(json)) {
    (window as any).__serverPlaceOrdersQuotesAsOf = null;
    return json as PlaceOrderRow[];
  }
  (window as any).__serverPlaceOrdersQuotesAsOf = json.quotesAsOf ?? null;
  return (json.orders || []) as PlaceOrderRow[];
};

const saveNewOrder = async (): Promise<void> => {
  const root = document.querySelector('[data-place-orders-table-root]');
  const addingRow = root?.querySelector('.adding') as HTMLElement;
  if (!addingRow) return;

  if (addingRow.hasAttribute('data-saving')) return;
  addingRow.setAttribute('data-saving', 'true');

  const accountSelect = addingRow.querySelector('#new-account') as HTMLSelectElement;
  const symbolInput = addingRow.querySelector('#new-symbol') as HTMLInputElement;
  const actionSelect = addingRow.querySelector('#new-action') as HTMLSelectElement;
  const priceInput = addingRow.querySelector('#new-price') as HTMLInputElement;
  const quantityInput = addingRow.querySelector('#new-quantity') as HTMLInputElement;

  const accountId = accountSelect.value;
  const symbol = symbolInput.value.trim().toUpperCase();
  const action = actionSelect.value;
  const price = parseFloat(priceInput.value);
  const quantity = Math.round(parseFloat(quantityInput.value));

  if (!accountId) {
    showErrorModal('Account is required');
    addingRow.removeAttribute('data-saving');
    return;
  }
  if (!symbol) {
    showErrorModal('Symbol is required');
    addingRow.removeAttribute('data-saving');
    return;
  }
  if (!action) {
    showErrorModal('Action is required');
    addingRow.removeAttribute('data-saving');
    return;
  }
  if (isNaN(price) || price <= 0) {
    showErrorModal('Valid price is required');
    addingRow.removeAttribute('data-saving');
    return;
  }
  if (isNaN(quantity) || quantity <= 0) {
    showErrorModal('Valid quantity is required');
    addingRow.removeAttribute('data-saving');
    return;
  }

  try {
    const response = await fetch(REQUEST_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ accountId, symbol, action, price, quantity }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to add order');
    }

    const newOrder: PlaceOrderRow = await response.json();
    lastAddedOrderId = newOrder.PlaceOrderID;

    loadData();

  } catch (error) {
    console.error('Error adding order:', error);
    showErrorModal('Failed to add order');
    addingRow.removeAttribute('data-saving');
  }
};

const deleteOrder = async (id: number): Promise<void> => {
  const response = await fetch(`${REQUEST_ENDPOINT}/${id}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to delete order');
  }
};

const cancelAddOrder = () => {
  const root = document.querySelector('[data-place-orders-table-root]');
  const addingRow = root?.querySelector('.adding');
  if (addingRow) {
    addingRow.remove();
  }
};

const saveEditOrder = async (row: HTMLElement): Promise<void> => {
  // If already saving, ignore
  if (row.hasAttribute('data-saving')) return;

  const orderId = parseInt(row.getAttribute('data-order-id') || '0');
  const priceInput = row.querySelector('.edit-price') as HTMLInputElement;
  const quantityInput = row.querySelector('.edit-quantity') as HTMLInputElement;

  if (!priceInput || !quantityInput) {
    return;
  }

  const price = parseFloat(priceInput.value);
  const quantity = Math.round(parseFloat(quantityInput.value));

  if (isNaN(price) || price <= 0) {
    showErrorModal('Valid price is required');
    return;
  }
  if (isNaN(quantity) || quantity <= 0) {
    showErrorModal('Valid quantity is required');
    return;
  }

  // If order is OPEN, warn the user that saving will cancel open broker orders
  const statusCell = row.querySelector('.order-status');
  const status = statusCell?.textContent?.trim().toUpperCase();
  if (status === 'OPEN') {
    // Show confirmation modal
    const symbol = (row.querySelector('.order-symbol')?.textContent || '').trim();
    const messageEl = document.getElementById('place-orders-modify-message');
    if (messageEl) {
      messageEl.textContent = symbol ? `Saving changes to "${symbol}" will cancel any existing OPEN orders on the broker. Do you want to continue?` : 'Saving changes will cancel any existing OPEN orders on the broker. Do you want to continue?';
    }

    (window as any)._pendingEditSave = { orderId, price, quantity, row };

    const confirmBtn = document.getElementById('confirm-modify-order');
    if (confirmBtn) {
      const newHandler = async () => {
        const pending = (window as any)._pendingEditSave;
        if (!pending) return;
        try {
          await performSaveEditOrder(pending.orderId, pending.price, pending.quantity, true, pending.row);
        } catch (err) {
          // performSaveEditOrder shows errors
        } finally {
          (window as any)._pendingEditSave = null;
          const modalEl = document.getElementById('placeOrdersModifyModal');
          if (modalEl && (window as any).bootstrap) {
            const modal = (window as any).bootstrap.Modal.getOrCreateInstance(modalEl);
            modal.hide();
          }
        }
      };
      const newBtn = confirmBtn.cloneNode(true);
      confirmBtn.parentNode?.replaceChild(newBtn, confirmBtn);
      newBtn.addEventListener('click', newHandler);
    }

    const modalEl = document.getElementById('placeOrdersModifyModal');
    if (modalEl && (window as any).bootstrap) {
      const modal = (window as any).bootstrap.Modal.getOrCreateInstance(modalEl);
      modal.show();
    }

    return;
  }

  // Otherwise, just save immediately (no broker cancel required)
  await performSaveEditOrder(orderId, price, quantity, false, row);
};

const performSaveEditOrder = async (orderId: number, price: number, quantity: number, cancelExisting: boolean, row: HTMLElement | null) => {
  if (row && row.hasAttribute('data-saving')) return;
  if (row) row.setAttribute('data-saving', 'true');

  try {
    const response = await fetch(`${REQUEST_ENDPOINT}/${orderId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ price, quantity, cancelExisting }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to update order');
    }

    // After updating, reload statuses and table
    await loadData();

  } catch (error) {
    console.error('Error updating order:', error);
    showErrorModal('Failed to update order');
  } finally {
    if (row) row.removeAttribute('data-saving');
  }
};

const cancelEditOrder = (row: HTMLElement) => {
  row.classList.remove('editing');
  const originalPrice = row.getAttribute('data-original-price');
  const originalQuantity = row.getAttribute('data-original-quantity');
  const originalAmount = row.getAttribute('data-original-order-amount');
  
  const priceCell = row.querySelector('.order-price');
  const quantityCell = row.querySelector('.order-quantity');
  const amountCell = row.querySelector('.order-amount');
  const actionsCell = row.querySelector('.actions');
  
  if (priceCell && originalPrice) {
    priceCell.innerHTML = formatCurrency(parseFloat(originalPrice));
  }
  if (quantityCell && originalQuantity) {
    quantityCell.innerHTML = formatQuantity(parseInt(originalQuantity));
  }
  if (amountCell && originalAmount) {
    amountCell.innerHTML = formatOrderAmount(parseFloat(originalAmount));
  }
  if (actionsCell) {
    actionsCell.innerHTML = `
      <button class="btn btn-sm btn-danger delete-btn" title="Delete">
        <i class="fa-solid fa-trash" aria-hidden="true"></i>
      </button>
    `;
    attachHandlersToRow(row);
  }
};

const startEditOrder = (row: HTMLElement) => {
  if (row.classList.contains('editing')) return;
  
  // Don't allow editing if order status is EXECUTED
  const statusCell = row.querySelector('.order-status');
  const status = statusCell?.textContent?.trim().toUpperCase();
  if (status === 'EXECUTED') {
    return;
  }
  
  // Cancel any other editing rows
  const root = document.querySelector('[data-place-orders-table-root]');
  root?.querySelectorAll('tr.editing').forEach(editingRow => {
    cancelEditOrder(editingRow as HTMLElement);
  });

  row.classList.add('editing');
  
  const priceCell = row.querySelector('.order-price');
  const quantityCell = row.querySelector('.order-quantity');
  const actionsCell = row.querySelector('.actions');
  
  if (!priceCell || !quantityCell || !actionsCell) return;
  
  const currentPrice = priceCell.textContent?.replace('$', '').trim() || '0';
  const currentQuantity = quantityCell.textContent?.trim() || '0';
  const currentAmountRaw = (row.querySelector('.order-amount')?.textContent || '').replace('$', '').replace(/,/g, '').trim() || '0';
  
  row.setAttribute('data-original-price', currentPrice);
  row.setAttribute('data-original-quantity', currentQuantity);
  row.setAttribute('data-original-order-amount', currentAmountRaw);
  
  // Put price input and calculator button together (same layout as add-row)
  priceCell.innerHTML = `
    <div class="d-flex align-items-center">
      <input type="number" class="form-control form-control-sm edit-price" value="${currentPrice}" step="0.01" min="0" style="flex: 1; min-width: 120px;">
      <button class="btn btn-sm btn-outline-secondary ms-1 calc-btn" title="Calculate Quantity" style="padding: 0.25rem 0.4rem;">
        <i class="fa-solid fa-calculator"></i>
      </button>
    </div>
  `;
  quantityCell.innerHTML = `<input type="number" class="form-control form-control-sm edit-quantity" value="${currentQuantity}" step="1" min="1">`;
  
  // Amount cell: read-only input (calculator located next to price)
  const amountCell = row.querySelector('.order-amount');
  if (amountCell) {
    amountCell.innerHTML = `<input type="text" class="form-control form-control-sm edit-order-amount" value="${formatOrderAmount(parseFloat(currentAmountRaw))}" readonly style="width: 100%;">`;
  }
  
  actionsCell.innerHTML = `
    <button class="btn btn-success btn-sm save-edit-btn" title="Save">
      <i class="fa-solid fa-check"></i>
    </button>
    <button class="btn btn-secondary btn-sm cancel-edit-btn ms-1" title="Cancel">
      <i class="fa-solid fa-xmark"></i>
    </button>
  `;
  
  const priceInput = priceCell.querySelector('.edit-price') as HTMLInputElement;
  const quantityInput = quantityCell.querySelector('.edit-quantity') as HTMLInputElement;
  const amountInput = amountCell?.querySelector('.edit-order-amount') as HTMLInputElement;
  
  // Update order amount when price or quantity changes
  const amountUpdater = () => {
    if (amountInput && priceInput && quantityInput) {
      updateOrderAmount(priceInput, quantityInput, amountInput);
    }
  };
  priceInput?.addEventListener('input', amountUpdater);
  quantityInput?.addEventListener('input', amountUpdater);
  
  // Calculator button to compute quantity (located in price cell)
  priceCell?.querySelector('.calc-btn')?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (priceInput && quantityInput && amountInput) {
      showCalculateQuantityModal(priceInput, quantityInput, amountInput);
    }
  });
  
  actionsCell.querySelector('.save-edit-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    saveEditOrder(row);
  });
  
  actionsCell.querySelector('.cancel-edit-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    cancelEditOrder(row);
  });
  
  priceInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveEditOrder(row);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEditOrder(row);
    }
  });
  
  quantityInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveEditOrder(row);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEditOrder(row);
    }
  });
  
  priceInput?.focus();
  priceInput?.select();
};

const attachHandlersToRow = (row: HTMLElement): void => {
  row.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    // Don't start editing if clicking on action buttons or if already editing
    if (target.closest('.actions') || row.classList.contains('editing')) return;
    startEditOrder(row);
  });

  row.querySelector('.delete-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const id = parseInt(row.getAttribute('data-order-id') || '0');
    const symbol = (row.querySelector('.order-symbol')?.textContent || '').trim();
    
    const messageEl = document.querySelector('#placeOrdersDeleteModal .modal-body');
    if (messageEl) {
      messageEl.textContent = symbol ? `Are you sure you want to delete the order for "${symbol}"? This will also cancel the order if it is still open.` : 'Are you sure you want to delete this order?';
    }

    (window as any)._pendingDeleteOrderId = id;

    const confirmBtn = document.getElementById('confirm-delete-order');
    if (confirmBtn) {
      const newHandler = async () => {
        const id = (window as any)._pendingDeleteOrderId;
        if (!id) return;
        try {
          await deleteOrder(id);
        } catch (error) {
          showErrorModal('Failed to delete order');
        } finally {
          (window as any)._pendingDeleteOrderId = null;
          const modalEl = document.getElementById('placeOrdersDeleteModal');
          if (modalEl && (window as any).bootstrap) {
            const modal = (window as any).bootstrap.Modal.getOrCreateInstance(modalEl);
            modal.hide();
          }
          loadData();
        }
      };
      const newBtn = confirmBtn.cloneNode(true);
      confirmBtn.parentNode?.replaceChild(newBtn, confirmBtn);
      newBtn.addEventListener('click', newHandler);
    }

    const modalEl = document.getElementById('placeOrdersDeleteModal');
    if (modalEl && (window as any).bootstrap) {
      const modal = (window as any).bootstrap.Modal.getOrCreateInstance(modalEl);
      modal.show();
    }
  });
};

const handleSort = (key: ColumnKey) => {
  if (currentSort.key === key) {
    currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
  } else {
    currentSort.key = key;
    currentSort.direction = 'asc';
  }
  loadData();
};

const formatCurrency = (value: number | string): string => {
  const numValue = typeof value === 'string' ? parseFloat(value) : value;
  return `$${numValue.toFixed(2)}`;
};

// Format order amount with comma separator when >= 1,000
const formatOrderAmount = (value: number | string): string => {
  const numValue = typeof value === 'string' ? parseFloat(value) : value;
  if (!isFinite(numValue)) return '$0.00';
  if (Math.abs(numValue) >= 1000) {
    // Insert commas for thousands separators
    return `$${numValue.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
  }
  return `$${numValue.toFixed(2)}`;
};

const formatQuantity = (value: number | string): string => {
  const numValue = typeof value === 'string' ? parseFloat(value) : value;
  return Math.round(numValue).toString();
};

const formatDateTime = (dateStr: string | null): string => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date);
};

const renderTable = (orders: PlaceOrderRow[] | null): void => {
  const root = document.querySelector('[data-place-orders-table-root]');
  if (!root) return;

  if (orders === null) {
    root.innerHTML = `
      <div class="text-center py-5">
        <div class="spinner-border spinner-border-sm text-secondary me-2" role="status"></div>
        <span class="fs-5 text-muted align-middle">Loading Place Orders...</span>
      </div>
    `;
    return;
  }

  const getSortIcon = (key: ColumnKey) => {
    if (currentSort.key !== key) return '';
    return currentSort.direction === 'asc' ? ' ▲' : ' ▼';
  };

  const tableHeader = `
    <thead>
      <tr>
        <th style="cursor: pointer;" data-sort="AccountName">Account${getSortIcon('AccountName')}</th>
        <th style="cursor: pointer;" data-sort="BrokerOrderID">Broker Order ID${getSortIcon('BrokerOrderID')}</th>
        <th style="cursor: pointer;" data-sort="Symbol">Symbol${getSortIcon('Symbol')}</th>
        <th style="cursor: pointer; min-width: 100px;" data-sort="Action">Action${getSortIcon('Action')}</th>
        <th style="cursor: pointer; min-width: 140px;" data-sort="Price">Order Price${getSortIcon('Price')}</th>
        <th style="cursor: pointer;" data-sort="CurrentPrice">Current Price${getSortIcon('CurrentPrice')}</th>
        <th style="cursor: pointer;" data-sort="Quantity">Quantity${getSortIcon('Quantity')}</th>
        <th style="cursor: pointer;" data-sort="OrderAmount">Order Amount${getSortIcon('OrderAmount')}</th>
        <th style="cursor: pointer;" data-sort="OrderStatus">Status${getSortIcon('OrderStatus')}</th>
        <th style="cursor: pointer;" data-sort="LastUpdated">Last Updated${getSortIcon('LastUpdated')}</th>
        <th style="white-space: nowrap;"></th>
      </tr>
    </thead>
  `;

  if (orders.length === 0) {
    root.innerHTML = `
      <table class="table table-striped table-hover">
        ${tableHeader}
        <tbody>
          <tr class="no-rows">
            <td colspan="11" class="text-center text-muted">No orders found.</td>
          </tr>
        </tbody>
      </table>
    `;
    return;
  }

  root.innerHTML = `
    <table class="table table-striped table-hover">
      ${tableHeader}
      <tbody>
        ${orders.map(order => `
          <tr data-order-id="${order.PlaceOrderID}">
            <td class="order-account">${order.AccountName || 'Unknown'}</td>
            <td class="order-broker-order-id">${order.BrokerOrderID ?? ''}</td>
            <td class="order-symbol">${order.Symbol}</td>
            <td class="order-action">${order.Action}</td>
            <td class="order-price">${formatCurrency(order.Price)}</td>
            <td class="order-current-price">${typeof order.CurrentPrice !== 'undefined' && order.CurrentPrice != null ? formatCurrency(order.CurrentPrice) : ''}</td>
            <td class="order-quantity">${formatQuantity(order.Quantity)}</td>
            <td class="order-amount">${formatOrderAmount(order.OrderAmount)}</td>
            <td class="order-status">${order.Status || ''}</td>
            <td class="order-last-updated">${formatDateTime(order.LastUpdated)}</td>
            <td style="white-space: nowrap;" class="actions">
              <button class="btn btn-sm btn-danger delete-btn" title="Delete">
                <i class="fa-solid fa-trash" aria-hidden="true"></i>
              </button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    <div class="text-muted fst-italic small mt-2">Last refresh: ${new Date().toLocaleString()}</div>
  `;

  root.querySelectorAll('th[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.getAttribute('data-sort') as ColumnKey;
      handleSort(key);
    });
  });

  root.querySelectorAll('tbody tr[data-order-id]').forEach(row => {
    attachHandlersToRow(row as HTMLElement);
  });
};

const updateOrderAmount = (priceInput: HTMLInputElement, quantityInput: HTMLInputElement, amountDisplay: HTMLInputElement) => {
  const price = parseFloat(priceInput.value) || 0;
  const quantity = parseInt(quantityInput.value) || 0;
  const amount = price * quantity;
  amountDisplay.value = formatOrderAmount(amount);
};

const showCalculateQuantityModal = (priceInput: HTMLInputElement, quantityInput: HTMLInputElement, amountDisplay: HTMLInputElement) => {
  const price = parseFloat(priceInput.value) || 0;
  if (price <= 0) {
    showErrorModal('Please enter a valid price first');
    return;
  }

  const modalEl = document.getElementById('calculateQuantityModal');
  const dollarInput = document.getElementById('dollar-amount-input') as HTMLInputElement;
  const priceDisplay = document.getElementById('calc-price-display') as HTMLInputElement;
  const quantityDisplay = document.getElementById('calc-quantity-display') as HTMLInputElement;

  if (!modalEl || !dollarInput || !priceDisplay || !quantityDisplay) return;

  dollarInput.value = '';
  priceDisplay.value = formatCurrency(price);
  quantityDisplay.value = '';

  const updateCalc = () => {
    const dollarAmount = parseFloat(dollarInput.value) || 0;
    if (dollarAmount > 0 && price > 0) {
      const calculatedQty = Math.ceil(dollarAmount / price);
      quantityDisplay.value = calculatedQty.toString();
    } else {
      quantityDisplay.value = '';
    }
  };

  dollarInput.addEventListener('input', updateCalc);

  const confirmBtn = document.getElementById('confirm-calculated-quantity');
  if (confirmBtn) {
    const newHandler = (e: Event) => {
      e.stopPropagation();
      const calculatedQty = quantityDisplay.value;
      if (calculatedQty) {
        quantityInput.value = calculatedQty;
        updateOrderAmount(priceInput, quantityInput, amountDisplay);
      }
      const modal = (window as any).bootstrap.Modal.getOrCreateInstance(modalEl);
      modal.hide();
      
      // Prevent auto-save after modal closes by focusing on an input in the row
      setTimeout(() => {
        quantityInput.focus();
      }, 100);
    };
    const newBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode?.replaceChild(newBtn, confirmBtn);
    newBtn.addEventListener('click', newHandler);
  }

  const modal = (window as any).bootstrap.Modal.getOrCreateInstance(modalEl);
  modal.show();
};

const startAddNewOrder = async (): Promise<void> => {
  const root = document.querySelector('[data-place-orders-table-root]');
  if (!root) return;

  const table = root.querySelector('table');
  if (!table) return;

  if (table.querySelector('.adding')) return;

  const tbody = table.querySelector('tbody');
  if (!tbody) return;

  const accounts = (window as any).lumos?.accounts || [];
  // Filter to E*TRADE accounts only (BrokerID = 1)
  const etradeAccounts = accounts.filter((a: any) => a.BrokerID === 1);
  const accountOptions = etradeAccounts.map((a: Account) => `<option value="${a.AccountID}">${a.Name}</option>`).join('');

  const addRowHtml = `
    <tr class="adding">
      <td>
        <select class="form-select form-select-sm" id="new-account" style="width: 100%;">
          <option value="">Select Account</option>
          ${accountOptions}
        </select>
      </td>
      <td class="text-muted"><em>Auto</em></td>
      <td><input type="text" class="form-control form-control-sm" id="new-symbol" placeholder="Symbol" style="width: 100%;"></td>
      <td>
        <select class="form-select form-select-sm" id="new-action" style="width: 100%;">
          <option value="BUY" selected>BUY</option>
          <option value="SELL">SELL</option>
          <option value="BUY_TO_COVER">BUY_TO_COVER</option>
          <option value="SELL_SHORT">SELL_SHORT</option>
        </select>
      </td>
      <td>
        <div class="d-flex align-items-center">
          <input type="number" class="form-control form-control-sm" id="new-price" placeholder="Price" step="0.01" min="0" style="flex: 1; min-width: 120px;">
          <button class="btn btn-sm btn-outline-secondary ms-1 calc-btn" title="Calculate Quantity" style="padding: 0.25rem 0.4rem;">
            <i class="fa-solid fa-calculator"></i>
          </button>
        </div>
      </td>
      <td class="text-muted"><em>Auto</em></td>
      <td><input type="number" class="form-control form-control-sm" id="new-quantity" placeholder="Qty" step="1" min="1" pattern="[0-9]+" style="width: 100%;"></td>
      <td><input type="text" class="form-control form-control-sm" id="new-order-amount" readonly style="width: 100%;"></td>
      <td class="text-muted"><em>Auto</em></td>
      <td class="text-muted"><em>Auto</em></td>
      <td style="white-space: nowrap;">
        <button class="btn btn-success btn-sm save-btn" title="Save">
          <i class="fa-solid fa-check"></i>
        </button>
        <button class="btn btn-secondary btn-sm cancel-btn ms-1" title="Cancel">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </td>
    </tr>
  `;

  tbody.insertAdjacentHTML('afterbegin', addRowHtml);

  const addRow = tbody.querySelector('.adding');
  if (addRow) {
    const priceInput = addRow.querySelector('#new-price') as HTMLInputElement;
    const quantityInput = addRow.querySelector('#new-quantity') as HTMLInputElement;
    const amountDisplay = addRow.querySelector('#new-order-amount') as HTMLInputElement;

    priceInput.addEventListener('input', () => updateOrderAmount(priceInput, quantityInput, amountDisplay));
    quantityInput.addEventListener('input', () => updateOrderAmount(priceInput, quantityInput, amountDisplay));

    addRow.querySelector('.calc-btn')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      showCalculateQuantityModal(priceInput, quantityInput, amountDisplay);
    });

    addRow.querySelector('.save-btn')?.addEventListener('click', () => saveNewOrder());
    addRow.querySelector('.cancel-btn')?.addEventListener('click', () => cancelAddOrder());

    addRow.querySelectorAll('input, select').forEach(input => {
      input.addEventListener('keydown', (e) => {
        const keyEvent = e as KeyboardEvent;
        if (keyEvent.key === 'Enter') {
          e.preventDefault();
          saveNewOrder();
        } else if (keyEvent.key === 'Escape') {
          e.preventDefault();
          cancelAddOrder();
        }
      });
    });
  }
};

let loadingTimer: ReturnType<typeof setTimeout> | null = null;
const loadData = async (): Promise<void> => {
  const root = document.querySelector('[data-place-orders-table-root]');
  if (root) {
    if (loadingTimer) clearTimeout(loadingTimer);
    loadingTimer = setTimeout(() => {
      renderTable(null);
    }, 250);
  }
  try {
    const orders = await fetchPlaceOrders();
    if (loadingTimer) {
      clearTimeout(loadingTimer);
      loadingTimer = null;
    }
    renderTable(orders);

    // Update the top-right quotes "Quotes as of" display
    const serverQuotesAsOf = (window as any).__serverPlaceOrdersQuotesAsOf as string | null | undefined;
    const dateDisplay = document.getElementById('place-orders-date-display');
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
        dateDisplay.innerHTML = '';
      }
    }

  } catch (error) {
    if (loadingTimer) {
      clearTimeout(loadingTimer);
      loadingTimer = null;
    }
    console.error('Error loading place orders:', error);
    if (root) {
      root.innerHTML = '<div class="alert alert-danger">Failed to load place orders</div>';
    }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  loadData();

  document.getElementById('add-new-order')?.addEventListener('click', () => startAddNewOrder());

  // Refresh Status button: call server-side status refresh and then reload the table
  document.getElementById('refresh-order-status')?.addEventListener('click', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('refresh-order-status') as HTMLButtonElement;
    if (!btn) return;
    btn.disabled = true;
    const originalHtml = btn.innerHTML;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>';
    try {
      const response = await fetch(`${REQUEST_ENDPOINT}?action=refreshStatus`, { method: 'POST' });
      if (!response.ok) throw new Error('Failed to refresh status');
      await loadData();
    } catch (err) {
      console.error('Failed to refresh place order status:', err);
      showErrorModal('Failed to refresh order status');
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    }
  });

  // Process Orders button: call server-side ProcessOrders and then reload the table
  document.getElementById('process-orders')?.addEventListener('click', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('process-orders') as HTMLButtonElement;
    if (!btn) return;
    btn.disabled = true;
    const originalHtml = btn.innerHTML;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>';
    try {
      const response = await fetch(`${REQUEST_ENDPOINT}?action=processOrders`, { method: 'POST' });
      if (!response.ok) throw new Error('Failed to process orders');
      await loadData();
    } catch (err) {
      console.error('Failed to process orders:', err);
      showErrorModal('Failed to process orders');
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    }
  });

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
      await loadData();
      if (!result.success && result.error) {
        (window as any).LumosErrorUtils.displayDismissibleError(document.body, result.error, 'Refresh Quotes completed with errors');
      } else if (result.refreshErrors) {
        (window as any).LumosErrorUtils.displayDismissibleError(document.body, result.refreshErrors, 'Refresh Quotes completed with errors');
      }
    } catch (err) {
      console.error('Failed to refresh quotes:', err);
      showErrorModal('Failed to refresh quotes');
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    }
  });

  document.getElementById('place-orders-title')?.addEventListener('click', (e) => {
    e.preventDefault();
    loadData();
  });

  // Clear Executed Orders button
  document.getElementById('clear-executed-orders')?.addEventListener('click', (e) => {
    e.preventDefault();
    const modalEl = document.getElementById('clearExecutedModal');
    if (modalEl && (window as any).bootstrap) {
      const modal = (window as any).bootstrap.Modal.getOrCreateInstance(modalEl);
      modal.show();
    }
  });

  // Confirm clear executed orders
  document.getElementById('confirm-clear-executed')?.addEventListener('click', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('confirm-clear-executed') as HTMLButtonElement;
    if (!btn) return;
    btn.disabled = true;
    const originalHtml = btn.innerHTML;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>';
    try {
      const response = await fetch(`${REQUEST_ENDPOINT}?action=clearExecuted`, { method: 'POST' });
      if (!response.ok) throw new Error('Failed to clear executed orders');
      
      const modalEl = document.getElementById('clearExecutedModal');
      if (modalEl && (window as any).bootstrap) {
        const modal = (window as any).bootstrap.Modal.getOrCreateInstance(modalEl);
        modal.hide();
      }
      
      await loadData();
    } catch (err) {
      console.error('Failed to clear executed orders:', err);
      showErrorModal('Failed to clear executed orders');
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    }
  });
});

})();
