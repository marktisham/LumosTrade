namespace OrdersClient {
type OrderRow = {
  OrderID: number | null;
  AccountID: number;
  BrokerID: number;
  BrokerOrderID: number | null;
  BrokerOrderStep: number | null;
  TradeID: number | null;
  TradeCloseDate: string | null;
  Symbol: string;
  Action: string;
  Quantity: number;
  Price: number;
  TotalFees: number;
  OrderAmount: number;
  ExecutedTime: string;
  IncompleteTrade: boolean;
  ManuallyAdjusted?: boolean;
  AdjustedComment?: string | null;
};

type SortDirection = 'asc' | 'desc';
type ColumnKey = keyof OrderRow | 'RunningTotal';
type ActionFilterValue = 'all' | 'buy' | 'sell' | 'buyToOpen' | 'sellToClose' | 'sellToOpen' | 'buyToClose';
type TradeStatusFilterValue = 'all' | 'open' | 'closed' | 'incomplete';

type SortState = {
  key: ColumnKey;
  direction: SortDirection;
};

type OrdersApiResponse = {
  asOf: string;
  orders: OrderRow[];
  sort: SortState;
};

type ColumnConfig = {
  key: ColumnKey;
  label: string;
  dataType: 'number' | 'string' | 'date' | 'boolean';
  formatter?: (row: OrderRow) => string;
  isNumeric?: boolean;
  width?: number;
};

const REQUEST_ENDPOINT = '/request/orders';

const numberFormatter = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const numberFormatterNoDecimals = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0
});


const formatCurrency = (value: number): string => {
  if (value < 0) {
    return `($${numberFormatter.format(Math.abs(value))})`;
  }
  return `$${numberFormatter.format(value)}`;
};

const formatCurrencyNoDecimals = (value: number): string => {
  if (value < 0) {
    return `($${numberFormatterNoDecimals.format(Math.abs(value))})`;
  }
  return `$${numberFormatterNoDecimals.format(value)}`;
};

// Fallback helper for rendering row counts. Uses global helper if available.
const ensureRenderRowCount = (container: HTMLElement, count: number, label: string = 'displayed') => {
  const fn = (window as any).__renderRowCount;
  if (typeof fn === 'function') { fn(container, count, label); return; }
  const className = 'table-rows-displayed';
  const existing = container.querySelector('.' + className) as HTMLElement | null;
  if (count <= 0) { if (existing) existing.remove(); return; }
  let el = existing;
  if (!el) {
    el = document.createElement('p');
    el.className = `text-muted small mt-3 mb-0 ${className}`;
    container.appendChild(el);
  }
  el.textContent = `${count} ${count === 1 ? 'row' : 'rows'} ${label}.`;
};

// Account mapping from server
type AccountInfo = {
  AccountID: number | null;
  Name: string;
  BrokerID: number;
};

type SymbolGroupInfo = {
  ID: number | null;
  Name: string;
  Symbols: string;
};

const accountMap = new Map<number, string>();
const accountBrokerMap = new Map<number, number>();
const brokerMap = new Map<number, string>();
const lumosAccounts = (window as any).LUMOS_ACCOUNTS as AccountInfo[] | undefined;
const lumosSymbolGroups = (window as any).LUMOS_SYMBOL_GROUPS as SymbolGroupInfo[] | undefined;
const lumosBrokers = (window as any).lumosAccountsBrokers as Array<{ BrokerID: number; Name: string }> | undefined;

if (lumosAccounts) {
  lumosAccounts.forEach((account: AccountInfo) => {
    if (account.AccountID !== null) {
      accountMap.set(account.AccountID, account.Name);
      accountBrokerMap.set(account.AccountID, account.BrokerID);
    }
  });
}

if (lumosBrokers) {
  lumosBrokers.forEach((broker) => {
    brokerMap.set(broker.BrokerID, broker.Name);
  });
}

const buildAccountFilterOptions = (): DropdownOption[] => {
  const options: DropdownOption[] = [];
  if (!lumosAccounts || lumosAccounts.length === 0) return options;

  const brokerNameById = new Map<number, string>();
  if (lumosBrokers) {
    lumosBrokers.forEach((broker) => brokerNameById.set(broker.BrokerID, broker.Name));
  }

  const accountsByBroker = new Map<number | null, AccountInfo[]>();
  lumosAccounts.forEach((account) => {
    if (account.AccountID === null) return;
    const brokerId = account.BrokerID ?? null;
    if (!accountsByBroker.has(brokerId)) accountsByBroker.set(brokerId, []);
    accountsByBroker.get(brokerId)!.push(account);
  });

  const brokerIds = new Set<number | null>();
  accountsByBroker.forEach((_accounts, brokerId) => brokerIds.add(brokerId));
  if (brokerIds.size <= 1) {
    const flatAccounts = (lumosAccounts || [])
      .filter(a => a.AccountID !== null)
      .sort((a, b) => a.Name.localeCompare(b.Name));
    flatAccounts.forEach((account) => {
      options.push({ value: account.AccountID!.toString(), label: account.Name });
    });
    return options;
  }

  const sortedBrokers = (lumosBrokers ? [...lumosBrokers] : []).sort((a, b) =>
    a.Name.localeCompare(b.Name)
  );

  sortedBrokers.forEach((broker) => {
    const accounts = accountsByBroker.get(broker.BrokerID);
    if (!accounts || accounts.length === 0) return;
    const groupName = broker.Name;
    if (accounts.length > 1) {
      options.push({
        value: `broker:${broker.BrokerID}`,
        label: `All ${groupName}`,
        labelHtml: `<em>All ${groupName}</em>`,
        group: groupName
      });
    }
    accounts.sort((a, b) => a.Name.localeCompare(b.Name)).forEach((account) => {
      options.push({ value: account.AccountID!.toString(), label: account.Name, group: groupName });
    });
    accountsByBroker.delete(broker.BrokerID);
  });

  accountsByBroker.forEach((accounts, brokerId) => {
    if (!accounts || accounts.length === 0) return;
    const groupName = brokerId !== null
      ? brokerNameById.get(brokerId) ?? `Broker ${brokerId}`
      : 'Other';
    if (brokerId !== null && accounts.length > 1) {
      options.push({
        value: `broker:${brokerId}`,
        label: `All ${groupName}`,
        labelHtml: `<em>All ${groupName}</em>`,
        group: groupName
      });
    }
    accounts.sort((a, b) => a.Name.localeCompare(b.Name)).forEach((account) => {
      options.push({ value: account.AccountID!.toString(), label: account.Name, group: groupName });
    });
  });

  return options;
};

const columns: ColumnConfig[] = [
  { key: 'TradeID', label: 'Trade<br>ID', dataType: 'number', isNumeric: true, formatter: (row) => row.TradeID ? `<a href="/trades?tradeId=${row.TradeID}" class="text-decoration-none" style="color: inherit;">${row.TradeID}</a>` : '—' },
  { key: 'BrokerOrderID', label: 'Broker<br>Order ID', dataType: 'number', isNumeric: true, width: 110 },
  {
    key: 'AccountID',
    label: 'Account',
    dataType: 'number',
    isNumeric: false,
    formatter: (row) => accountMap.get(row.AccountID) ?? String(row.AccountID)
  },
  {
    key: 'ExecutedTime',
    label: 'Filled',
    dataType: 'date',
    formatter: (row) => {
      const date = new Date(row.ExecutedTime);
      const datePart = date.toLocaleDateString('en-US', { timeZone: 'America/New_York', dateStyle: 'medium' });
      const timePart = date.toLocaleTimeString('en-US', { timeZone: 'America/New_York', timeStyle: 'medium' });
      return `${datePart}\n${timePart}`;
    }
  },
  { key: 'Symbol', label: 'Symbol', dataType: 'string' },
  { key: 'Action', label: 'Action', dataType: 'string', formatter: (row) => {
    // Display-only mapping: do not change underlying Action values
    const map: Record<string, string> = {
      'BUY_TO_COVER': 'Cover',
      'SELL_SHORT': 'Short',
      'SELL_TO_SHORT': 'Short'
    };
    if (map[row.Action]) return map[row.Action];
    if (row.Action === 'BUY') return 'Buy';
    if (row.Action === 'SELL') return 'Sell';
    return row.Action;
  } },
  { key: 'Quantity', label: 'Qty', dataType: 'number', isNumeric: true, formatter: (row) => {
    // For display only: show sell actions as negative quantities
    const q = Number.isFinite(Number(row.Quantity)) ? Number(row.Quantity) : 0;
    const sellActions = new Set(['SELL', 'SELL_SHORT', 'SELL_TO_SHORT']);
    const display = sellActions.has(row.Action) ? -Math.abs(q) : q;
    return numberFormatterNoDecimals.format(display);
  } },
  {
    key: 'Price',
    label: 'Price',
    dataType: 'number',
    isNumeric: true,
    formatter: (row) => formatCurrency(row.Price)
  },
  {
    key: 'OrderAmount',
    label: 'Amount',
    dataType: 'number',
    isNumeric: true,
    formatter: (row) => formatCurrency(row.OrderAmount)
  },
  {
    key: 'TotalFees',
    label: 'Fees',
    dataType: 'number',
    isNumeric: true,
    formatter: (row) => {
      // If fee information is missing or not a finite number, show a dash
      // Also show a dash when fees are exactly zero (no fees charged)
      if (!Number.isFinite(row.TotalFees) || row.TotalFees === 0) return '—';
      return formatCurrency(row.TotalFees);
    }
  },
];

const renderStatsSection = (container: HTMLElement, orders: OrderRow[], asOf: string) => {
  const statsWrapper = document.createElement('div');
  statsWrapper.className = 'mb-4';

  // Fallback helper for rendering row counts. Uses global helper if available.
  const ensureRenderRowCount = (container: HTMLElement, count: number) => {
    const fn = (window as any).__renderRowCount;
    if (typeof fn === 'function') { fn(container, count); return; }
    const className = 'table-rows-displayed';
    const existing = container.querySelector('.' + className) as HTMLElement | null;
    if (count <= 0) { if (existing) existing.remove(); return; }
    let el = existing;
    if (!el) {
      el = document.createElement('p');
      el.className = `text-muted small mt-3 mb-0 ${className}`;
      container.appendChild(el);
    }
    el.textContent = `${count} ${count === 1 ? 'row' : 'rows'} displayed.`;
  };
  
  if (orders.length === 0) {
    const alert = document.createElement('div');
    alert.className = 'alert alert-info mb-3';
    alert.innerHTML = `
      <div class="d-flex align-items-center">
        <div class="me-3" style="font-size: 2rem;">ℹ️</div>
        <div>
          <strong>No orders to display</strong>
        </div>
      </div>
    `;
    statsWrapper.appendChild(alert);
    container.appendChild(statsWrapper);
    return;
  }
  
  // Calculate stats (match the 'Trade' column logic)
  const totalOrders = orders.length;
  // An order is considered 'Incomplete' if `IncompleteTrade` is true (this overrides other states)
  const incompleteTradeOrders = orders.filter(o => o.IncompleteTrade).length;
  // An order is considered 'Closed' when it has a TradeID and a non-null TradeCloseDate
  const closedTradeOrders = orders.filter(o => !o.IncompleteTrade && o.TradeID !== null && o.TradeCloseDate != null).length;
  // Everything else that is not incomplete or closed is 'Open' (covers TradeID === null OR TradeID present but TradeCloseDate null)
  const openTradeOrders = totalOrders - incompleteTradeOrders - closedTradeOrders;
  
  // Determine action groupings: BUY, SELL, SELL_SHORT, BUY_TO_COVER
  const buyCount = orders.filter(o => o.Action === 'BUY').length;
  const sellCount = orders.filter(o => o.Action === 'SELL').length;
  const sellShortCount = orders.filter(o => o.Action === 'SELL_SHORT').length;
  const buyToCoverCount = orders.filter(o => o.Action === 'BUY_TO_COVER').length;
  const actionGroups = [
    { count: buyCount, label: 'Buy' },
    { count: sellCount, label: 'Sell' },
    { count: sellShortCount, label: 'Sell Short' },
    { count: buyToCoverCount, label: 'Buy To Cover' }
  ];
  // Show percent only when more than one grouping has a value
  const nonZeroActionGroups = actionGroups.filter(g => g.count > 0);
  const showPercents = nonZeroActionGroups.length > 1;
  const actionLines = nonZeroActionGroups.map(g => {
    const pct = totalOrders > 0 ? (g.count / totalOrders * 100).toFixed(1) : '0.0';
    return `<div class="small text-muted">${g.count} ${g.label}${showPercents ? ` (${pct}%)` : ''}</div>`;
  }).join('\n');

  // Aggregate fees but ignore missing/NaN values so we don't produce NaN in the UI
  const feeValues = orders.map(o => Number.isFinite(o.TotalFees) ? o.TotalFees : null).filter(v => v !== null) as number[];
  const totalFees = feeValues.reduce((sum, f) => sum + f, 0);
  const feeCount = feeValues.length;
  const totalOrderAmount = orders.reduce((sum, o) => sum + Math.abs(o.OrderAmount), 0);
  const avgOrderAmount = totalOrderAmount / totalOrders;
  const avgFees = feeCount > 0 ? totalFees / feeCount : NaN;
  const largestOrderAmount = orders.length > 0 ? Math.max(...orders.map(o => Math.abs(o.OrderAmount))) : 0;
  
  // Round values for display
  const avgOrderAmountRounded = Math.round(avgOrderAmount);
  const totalOrderAmountRounded = Math.round(totalOrderAmount);
  const totalFeesRounded = feeCount > 0 ? Math.round(totalFees) : null;
  const largestOrderAmountRounded = Math.round(largestOrderAmount);
  
  // Determine status based on incomplete orders
  const hasIncomplete = incompleteTradeOrders > 0;

  // Cost basis calculations
  const buyTotal = orders.reduce((s, o) => s + (o.Action === 'BUY' ? (Number.isFinite(o.OrderAmount) ? o.OrderAmount : 0) : 0), 0);
  const buyToCoverTotal = orders.reduce((s, o) => s + (o.Action === 'BUY_TO_COVER' ? (Number.isFinite(o.OrderAmount) ? o.OrderAmount : 0) : 0), 0);
  const sellTotal = orders.reduce((s, o) => s + (o.Action === 'SELL' ? (Number.isFinite(o.OrderAmount) ? o.OrderAmount : 0) : 0), 0);
  const sellShortTotal = orders.reduce((s, o) => s + (o.Action === 'SELL_SHORT' ? (Number.isFinite(o.OrderAmount) ? o.OrderAmount : 0) : 0), 0);
  // Cost basis = buys + buyToCovers - (sells + sellShorts)
  const costBasis = buyTotal + buyToCoverTotal - (sellTotal + sellShortTotal);
  const buyTotalRounded = Math.round(buyTotal);
  const buyToCoverTotalRounded = Math.round(buyToCoverTotal);
  const sellTotalRounded = Math.round(sellTotal);
  const sellShortTotalRounded = Math.round(sellShortTotal);
  const costBasisRounded = Math.round(costBasis);
  // Quantities for Open Qty (add buys and buyToCovers, subtract sells and sellShorts)
  const buyQty = orders.reduce((s, o) => s + ((o.Action === 'BUY' || o.Action === 'BUY_TO_COVER') ? (Number.isFinite(o.Quantity) ? o.Quantity : 0) : 0), 0);
  const sellQty = orders.reduce((s, o) => s + ((o.Action === 'SELL' || o.Action === 'SELL_SHORT') ? (Number.isFinite(o.Quantity) ? o.Quantity : 0) : 0), 0);
  const openQty = Math.round(buyQty - sellQty);

  const subtotalLines = [
    buyTotalRounded !== 0 ? `<div class="small text-muted">Buy: ${formatCurrencyNoDecimals(Math.abs(buyTotalRounded))}</div>` : '',
    sellTotalRounded !== 0 ? `<div class="small text-muted">Sell: ${formatCurrencyNoDecimals(Math.abs(sellTotalRounded))}</div>` : '',
    sellShortTotalRounded !== 0 ? `<div class="small text-muted">Sell Short: ${formatCurrencyNoDecimals(Math.abs(sellShortTotalRounded))}</div>` : '',
    buyToCoverTotalRounded !== 0 ? `<div class="small text-muted">Buy To Cover: ${formatCurrencyNoDecimals(Math.abs(buyToCoverTotalRounded))}</div>` : ''
  ].filter(Boolean).join('\n');

  let openQtyLine = '';
  if (openQty > 0) {
    if (costBasis > 0) {
      const breakevenPrice = costBasis / openQty;
      openQtyLine = `<div class="mt-2"><div class="small text-muted">Holding: ${numberFormatterNoDecimals.format(openQty)} @ ${formatCurrency(breakevenPrice)}</div></div>`;
    } else if (costBasis < 0) {
      openQtyLine = `<div class="mt-2"><div class="small text-muted">Open Qty: ${numberFormatterNoDecimals.format(openQty)} (House Money!)</div></div>`;
    } else {
      openQtyLine = `<div class="mt-2"><div class="small text-muted">Open Qty: ${numberFormatterNoDecimals.format(openQty)}</div></div>`;
    }
  }

  // Determine title and styling for Cost Basis/Gain card based on open qty
  const cardTitle = openQty === 0 ? 'Total Gain' : 'Cost Basis';
  let cardValueClass = '';
  let cardValueFormatted = '';
  
  if (openQty === 0) {
    // When position is closed (openQty = 0), show total gain (inverse of cost basis)
    const totalGainRounded = -costBasisRounded;
    if (totalGainRounded < 0) {
      // Loss: show in parentheses and red
      cardValueClass = 'text-danger';
      cardValueFormatted = `(${formatCurrencyNoDecimals(Math.abs(totalGainRounded))})`;
    } else if (totalGainRounded > 0) {
      // Gain: show in green
      cardValueClass = 'text-success';
      cardValueFormatted = formatCurrencyNoDecimals(totalGainRounded);
    } else {
      // Zero: no special formatting
      cardValueFormatted = formatCurrencyNoDecimals(totalGainRounded);
    }
  } else {
    // When position is open (openQty != 0), use existing logic
    cardValueClass = costBasisRounded < 0 ? 'text-success' : '';
    cardValueFormatted = formatCurrencyNoDecimals(costBasisRounded);
  }

  const statsContent = document.createElement('div');
  statsContent.className = 'row g-3';
  statsContent.innerHTML = `
    <div class="col-md-3">
      <div class="card border-0 shadow-sm h-100 stats-card ${hasIncomplete ? 'stats-card-warning' : ''}">
        <div class="card-body text-center">
          <div class="stats-icon mb-2">📋</div>
          <h6 class="card-subtitle mb-2 text-muted text-uppercase small">Total Orders</h6>
          <h3 class="card-title mb-1 fw-bold">${totalOrders}</h3>
          ${actionLines}
          ${incompleteTradeOrders > 0 ? `<div class="small text-warning fw-bold">${incompleteTradeOrders} Incomplete ⚠️</div>` : ''}
        </div>
      </div>
    </div>
    <div class="col-md-3">
      <div class="card border-0 shadow-sm h-100 stats-card">
        <div class="card-body text-center">
          <div class="stats-icon mb-2">📈</div>
          <h6 class="card-subtitle mb-2 text-muted text-uppercase small">${cardTitle}</h6>
          <h3 class="card-title mb-1 fw-bold ${cardValueClass}">${cardValueFormatted}</h3>
          ${subtotalLines !== '' ? subtotalLines : '<div class="small text-muted">&nbsp;</div>'}
          ${openQtyLine}
        </div>
      </div>
    </div>
    <div class="col-md-3">
      <div class="card border-0 shadow-sm h-100 stats-card">
        <div class="card-body text-center">
          <div class="stats-icon mb-2">💵</div>
          <h6 class="card-subtitle mb-2 text-muted text-uppercase small">Avg Order Size</h6>
          <h3 class="card-title mb-1 fw-bold">${formatCurrencyNoDecimals(avgOrderAmountRounded)}</h3>
          <div class="small text-muted">Largest: ${formatCurrencyNoDecimals(largestOrderAmountRounded)}</div>
          <div class="small text-muted">&nbsp;</div>
        </div>
      </div>
    </div>
    <div class="col-md-3">
      <div class="card border-0 shadow-sm h-100 stats-card">
        <div class="card-body text-center">
          <div class="stats-icon mb-2">💸</div>
          <h6 class="card-subtitle mb-2 text-muted text-uppercase small">Total Fees</h6>
          <h3 class="card-title mb-1 fw-bold">${feeCount > 0 && totalFeesRounded! !== 0 ? formatCurrencyNoDecimals(totalFeesRounded!) : '—'}</h3>
          <div class="small text-muted">Avg: ${feeCount > 0 && avgFees !== 0 ? formatCurrency(avgFees) : '—'}</div>
          
        </div>
      </div>
    </div>
  `;
  
  statsWrapper.appendChild(statsContent);
  container.appendChild(statsWrapper);
};

const renderToolbar = (container: HTMLElement, onImportOrders: () => void, accountId: number | null, brokerId: number | null, symbol: string | null, runningTotalsEnabled: boolean, onRunningTotals: () => void) => {
  const toolbar = document.createElement('div');
  toolbar.className = 'btn-toolbar mb-3 flex-wrap flex-lg-nowrap gap-2 align-items-center';
  toolbar.setAttribute('role', 'toolbar');
  toolbar.setAttribute('aria-label', 'Orders toolbar');
  
  // Group A: Running Totals
  const groupA = document.createElement('div');
  groupA.className = 'btn-group me-3';
  groupA.setAttribute('role', 'group');
  groupA.setAttribute('aria-label', 'Order actions');

  if (runningTotalsEnabled) {
    const runningTotalsButton = document.createElement('button');
    runningTotalsButton.type = 'button';
    runningTotalsButton.className = 'btn btn-sm btn-outline-secondary';
    runningTotalsButton.textContent = 'Running Totals';
    runningTotalsButton.addEventListener('click', onRunningTotals);
    groupA.appendChild(runningTotalsButton);
  }

  // Group B: Import Orders
  const groupB = document.createElement('div');
  groupB.className = 'btn-group';
  groupB.setAttribute('role', 'group');

  const importOrdersButton = document.createElement('button');
  importOrdersButton.type = 'button';
  importOrdersButton.className = 'btn btn-sm btn-outline-secondary';
  importOrdersButton.innerHTML = '<i class="fa-solid fa-arrow-rotate-right" aria-hidden="true"></i> Orders';
  importOrdersButton.title = 'Resync Orders';
  importOrdersButton.addEventListener('click', onImportOrders);

  groupB.appendChild(importOrdersButton);

  if (runningTotalsEnabled) {
    toolbar.appendChild(groupA);
  }
  toolbar.appendChild(groupB);

  // Navigation links group (Accounts / History / Trades / Performance / Orders)
  const navLinksGroup = document.createElement('div');
  navLinksGroup.className = 'btn-group ms-auto';
  navLinksGroup.setAttribute('role', 'group');

  const buildNavUrl = (basePath: string): string => {
    const params = new URLSearchParams();
    if (brokerId) params.set('brokerId', String(brokerId));
    if (accountId) params.set('accountId', String(accountId));
    if (symbol) params.set('symbol', symbol);
    const queryString = params.toString();
    return queryString ? `${basePath}?${queryString}` : basePath;
  };

  const navAccountsBtn = document.createElement('button');
  navAccountsBtn.type = 'button';
  navAccountsBtn.className = 'btn btn-sm btn-outline-secondary';
  navAccountsBtn.textContent = 'Accounts';
  navAccountsBtn.title = 'View current balances of your accounts.';
  navAccountsBtn.addEventListener('click', () => { window.location.href = buildNavUrl('/accounts'); });

  const navPerfBtn = document.createElement('button');
  navPerfBtn.type = 'button';
  navPerfBtn.className = 'btn btn-sm btn-outline-secondary';
  navPerfBtn.textContent = 'History';
  navPerfBtn.title = 'View the profit and loss of your trades over time.';
  navPerfBtn.addEventListener('click', () => { window.location.href = buildNavUrl('/tradeHistory'); });

  const navTradesBtn = document.createElement('button');
  navTradesBtn.type = 'button';
  navTradesBtn.className = 'btn btn-sm btn-outline-secondary';
  navTradesBtn.textContent = 'Trades';
  navTradesBtn.title = 'View the current status of your open trades.';
  navTradesBtn.addEventListener('click', () => { window.location.href = buildNavUrl('/trades'); });

  const navHistoryBtn = document.createElement('button');
  navHistoryBtn.type = 'button';
  navHistoryBtn.className = 'btn btn-sm btn-outline-secondary';
  navHistoryBtn.textContent = 'Performance';
  navHistoryBtn.title = 'Track the value of your accounts over time.';
  navHistoryBtn.addEventListener('click', () => { window.location.href = buildNavUrl('/accountHistory'); });

  const navOrdersBtn = document.createElement('button');
  navOrdersBtn.type = 'button';
  navOrdersBtn.className = 'btn btn-sm btn-outline-secondary active';
  navOrdersBtn.disabled = true;
  navOrdersBtn.textContent = 'Orders';
  navOrdersBtn.addEventListener('click', () => { window.location.href = buildNavUrl('/orders'); });

  navLinksGroup.appendChild(navAccountsBtn);
  navLinksGroup.appendChild(navHistoryBtn);
  navLinksGroup.appendChild(navTradesBtn);
  navLinksGroup.appendChild(navPerfBtn);
  navLinksGroup.appendChild(navOrdersBtn);

  toolbar.appendChild(navLinksGroup);

  container.appendChild(toolbar);
};



const renderOrdersTable = (
  mountPoint: HTMLElement,
  orders: OrderRow[],
  asOf: string,
  sortState: SortState,
  actionFilter: ActionFilterValue,
  tradeStatusFilter: TradeStatusFilterValue,
  accountId: number | null,
  brokerId: number | null,
  symbol: string | null,
  tradeId: number | null,
  brokerOrderId: number | null,
  orderId: number | null,
  dateRange: string,
  executedDate: string | null,
  distinctSymbols: string[],
  distinctActions: string[],
  showRunningTotals: boolean,
  runningTotalsEnabled: boolean,
  onSort: (key: ColumnKey) => void,
  onActionFilterChange: (filter: ActionFilterValue) => void,
  onTradeStatusFilterChange: (filter: TradeStatusFilterValue) => void,
  onAccountFilterChange: (accountId: number | null) => void,
  onBrokerIdChange: (brokerId: number | null) => void,
  onSymbolFilterChange: (symbol: string | null) => void,
  onTradeIdFilterChange: (tradeId: number | null) => void,
  onBrokerOrderIdFilterChange: (brokerOrderId: number | null) => void,
  onDateRangeChange: (dateRange: string) => void,
  onImportOrders: () => void,
  onRunningTotals: () => void
) => {
  const wrapper = document.createElement('div');
  
  // Render stats section
  renderStatsSection(wrapper, orders, asOf);
  
  // Inject bookmark bar (if available). The actual rendering function is
  // provided by `initializeOrdersTable` via `window.__renderOrdersBookmarkBar`
  const bookmarkContainer = document.createElement('div');
  wrapper.appendChild(bookmarkContainer);
  const renderOrdersBookmark = (window as any).__renderOrdersBookmarkBar as ((c: HTMLElement) => void) | undefined;
  if (renderOrdersBookmark) {
    renderOrdersBookmark(bookmarkContainer);
  }

  // Render toolbar with buttons
  renderToolbar(wrapper, onImportOrders, accountId, brokerId, symbol, runningTotalsEnabled, onRunningTotals);

  // Inject hover style for clickable rows once
  if (typeof document !== 'undefined' && !document.getElementById('orders-client-hover-style')) {
    const style = document.createElement('style');
    style.id = 'orders-client-hover-style';
    style.textContent = `.table-row-clickable:hover { background-color: rgba(0,0,0,0.03); }`;
    document.head.appendChild(style);
  }

  const table = document.createElement('table');
  // Note: don't use the global 'table-hover' class so non-clickable rows don't highlight
  table.className = 'table align-middle mb-0';
  table.style.borderCollapse = 'separate';
  table.style.borderSpacing = '0';

  const thead = document.createElement('thead');
  thead.style.background = 'linear-gradient(to bottom, #e3f2fd, #bbdefb)';
  thead.style.position = 'sticky';
  thead.style.top = '0';
  thead.style.zIndex = '10';
  
  // Determine which columns to display
  const displayColumns = showRunningTotals 
    ? [...columns.slice(0, 9), { key: 'RunningTotal' as ColumnKey, label: 'Running<br>Total', dataType: 'string' as const, isNumeric: false }, ...columns.slice(9)]
    : columns;

  // Header row with sort controls
  const headerRow = document.createElement('tr');

  displayColumns.forEach((column) => {
    const headerCell = document.createElement('th');
    headerCell.scope = 'col';
    headerCell.tabIndex = 0;
    headerCell.dataset.columnKey = column.key;
    headerCell.className = 'text-nowrap sortable-column';
    if (sortState.key === column.key) {
      headerCell.classList.add('table-active');
      headerCell.setAttribute('aria-sort', sortState.direction === 'asc' ? 'ascending' : 'descending');
    } else {
      headerCell.setAttribute('aria-sort', 'none');
    }

    const label = document.createElement('span');
    label.innerHTML = column.label;

    // Apply width if specified in column config
    if (column.width) {
      headerCell.style.width = `${column.width}px`;
    }

    // Compact certain columns so they don't hog horizontal space
    if (column.key === 'AccountID') {
      headerCell.style.maxWidth = '190px';
      headerCell.style.minWidth = '110px';
      headerCell.style.overflow = 'hidden';
      headerCell.style.textOverflow = 'ellipsis';
      headerCell.style.whiteSpace = 'nowrap';
    } else if (column.key === 'Action' || column.key === 'TradeID') {
      headerCell.style.maxWidth = '80px';
      headerCell.style.minWidth = '60px';
      headerCell.style.overflow = 'hidden';
      headerCell.style.textOverflow = 'ellipsis';
      headerCell.style.whiteSpace = 'nowrap';
    }

    const indicator = document.createElement('span');
    indicator.className = 'sort-indicator text-muted';
    indicator.textContent = sortState.key === column.key ? (sortState.direction === 'asc' ? '▲' : '▼') : '';

    // Running Total column is not sortable
    if (column.key !== 'RunningTotal') {
      const activateSort = () => onSort(column.key);
      headerCell.addEventListener('click', activateSort);
      headerCell.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          activateSort();
        }
      });
    } else {
      headerCell.style.cursor = 'default';
    }

    headerCell.appendChild(label);
    headerCell.appendChild(indicator);
    headerRow.appendChild(headerCell);
  });

  thead.appendChild(headerRow);

  // Filter row
  const filterRow = document.createElement('tr');
  
  displayColumns.forEach((column) => {
    const filterCell = document.createElement('th');
    filterCell.scope = 'col';
    
    if (column.key === 'Symbol') {
      const options: DropdownOption[] = [];

      // Add Symbol Groups
      const distinctSymbolSet = new Set(distinctSymbols);
      if (lumosSymbolGroups) {
        lumosSymbolGroups.forEach(sg => {
          if (sg.Symbols) {
            const groupSymbols = sg.Symbols.split(',').map(s => s.trim());
            // Check if any symbol in the group is in the distinct symbols list
            if (groupSymbols.some(s => distinctSymbolSet.has(s))) {
               options.push({
                 value: `group:${sg.ID}`,
                 label: sg.Name,
                 group: 'Symbol Groups'
               });
            }
          }
        });
      }

      // Add individual symbols
      distinctSymbols.forEach(sym => {
        options.push({
          value: sym,
          label: sym,
          group: 'Symbols'
        });
      });

      const dropdown = createSearchableDropdown(
        options,
        symbol,
        'All',
        (val) => onSymbolFilterChange(val)
      );
      
      filterCell.appendChild(dropdown);
    }
    
    if (column.key === 'AccountID') {
      const selectedValue = accountId !== null
        ? accountId.toString()
        : (brokerId !== null ? `broker:${brokerId}` : null);
      const options = buildAccountFilterOptions();
      const dropdown = createSearchableDropdown(
        options,
        selectedValue,
        'All',
        (val) => {
          if (!val) {
            onAccountFilterChange(null);
            return;
          }
          if (val.startsWith('broker:')) {
            const id = parseInt(val.replace('broker:', ''), 10);
            onBrokerIdChange(Number.isFinite(id) ? id : null);
            return;
          }
          onAccountFilterChange(parseInt(val, 10));
        }
      );
      
      filterCell.appendChild(dropdown);
    }
    
    // Keep filter cells compact for Action and TradeID
    if (column.key === 'Action' || column.key === 'TradeID') {
      filterCell.style.maxWidth = '80px';
      filterCell.style.minWidth = '60px';
      filterCell.style.overflow = 'hidden';
      filterCell.style.textOverflow = 'ellipsis';
      filterCell.style.whiteSpace = 'nowrap';
    }
    
    if (column.key === 'BrokerOrderID') {
      const input = document.createElement('input');
      input.type = 'number';
      input.className = 'form-control form-control-sm';
      input.placeholder = 'Filter';
      if (brokerOrderId !== null) {
        input.value = brokerOrderId.toString();
      }
      
      input.addEventListener('change', () => {
        const value = input.value.trim();
        onBrokerOrderIdFilterChange(value === '' ? null : parseInt(value, 10));
      });
      
      filterCell.appendChild(input);
    }
    
    if (column.key === 'TradeID') {
      // If filtering by specific trade ID, show read-only text input
      if (tradeId !== null) {
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'form-control form-control-sm';
        input.value = tradeId.toString();
        input.readOnly = true;
        input.style.backgroundColor = '#2d2d2d';
        input.style.cursor = 'not-allowed';
        input.style.textAlign = 'center';
        filterCell.appendChild(input);
      } else {
        // Otherwise, show the status dropdown
        const statusSelect = document.createElement('select');
        statusSelect.className = 'form-select form-select-sm';
        const statusOptions = [
          { value: 'all', label: 'All' },
          { value: 'open', label: 'Open Trade' },
          { value: 'closed', label: 'Closed Trade' },
          { value: 'incomplete', label: 'Incomplete Trade' }
        ];
        statusOptions.forEach(opt => {
          const option = document.createElement('option');
          option.value = opt.value;
          option.textContent = opt.label;
          if (opt.value === tradeStatusFilter) option.selected = true;
          statusSelect.appendChild(option);
        });
        statusSelect.addEventListener('change', () => {
          onTradeStatusFilterChange(statusSelect.value as TradeStatusFilterValue);
        });
        filterCell.appendChild(statusSelect);
      }
    }
    
    if (column.key === 'ExecutedTime') {
      // Placeholder for dateRangeDropdown (initialized separately)
      const dropdownContainer = document.createElement('div');
      dropdownContainer.className = 'dropdown';
      dropdownContainer.id = 'orders-date-range-dropdown';
      dropdownContainer.innerHTML = `
        <button class="btn btn-sm btn-outline-secondary dropdown-toggle d-flex align-items-center justify-content-between w-100" type="button" data-bs-toggle="dropdown" aria-expanded="false" style="min-width: 120px;">
          <span class="text-truncate me-2" id="orders-date-range-label" style="color: #e8e8e8;">All</span>
        </button>
        <div class="dropdown-menu p-0 shadow-sm" style="width: 280px; max-height: 400px; overflow-y: auto;">
          <div class="p-2 border-bottom sticky-top" style="background-color: #1f1f1f;">
            <input type="text" class="form-control form-control-sm" placeholder="Search..." id="orders-date-range-search" style="background-color: #2d2d2d; border-color: #454545; color: #e8e8e8;">
          </div>
          <div id="orders-date-range-list">
          </div>
        </div>
      `;
      filterCell.appendChild(dropdownContainer);
    }
    
    if (column.key === 'Action') {
      const select = document.createElement('select');
      select.className = 'form-select form-select-sm';
      
      // Add "All" option
      const allOption = document.createElement('option');
      allOption.value = 'all';
      allOption.textContent = 'All';
      if (actionFilter === 'all') {
        allOption.selected = true;
      }
      select.appendChild(allOption);
      
      // Add action options from distinct actions in result set
      distinctActions.forEach((action: string) => {
        const option = document.createElement('option');
        // Convert action to filter value (e.g., "BUY_TO_OPEN" -> "buyToOpen")
        const filterValue = action.toLowerCase().replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
        option.value = filterValue;
        option.textContent = action.replace(/_/g, ' ');
        if (filterValue === actionFilter) {
          option.selected = true;
        }
        select.appendChild(option);
      });
      
      select.addEventListener('change', () => {
        onActionFilterChange(select.value as ActionFilterValue);
      });
      
      filterCell.appendChild(select);
    }
    
    
    
    filterRow.appendChild(filterCell);
  });

  thead.appendChild(filterRow);

  const tbody = document.createElement('tbody');
  
  // Calculate running totals if showing that column
  let runningQuantity = 0;
  let runningAmount = 0;
  const runningTotals: Array<{quantity: number, amount: number}> = [];
  
  if (showRunningTotals) {
    orders.forEach((row) => {
      const action = row.Action.toUpperCase();
      if (action === 'BUY' || action === 'BUY_TO_COVER') {
        runningQuantity += row.Quantity;
        runningAmount -= row.OrderAmount;
      } else { // SELL or SELL_SHORT
        runningQuantity -= row.Quantity;
        runningAmount += row.OrderAmount;
      }
      runningTotals.push({ quantity: runningQuantity, amount: runningAmount });
    });
  }
  
  orders.forEach((row, rowIndex) => {
    const tr = document.createElement('tr');
    tr.dataset.orderId = String(row.OrderID);

    displayColumns.forEach((column) => {
      const cell = document.createElement('td');
      
        // No separate Trade column any more; status is shown as a badge under OrderID
      
      // Center numeric ID columns
      if (column.key === 'BrokerOrderID' || column.key === 'TradeID') {
        cell.classList.add('text-center');
      } else {
        // Left-align all other columns explicitly
        cell.classList.add('text-start');
      }

      // Make Account cells compact
      if (column.key === 'AccountID') {
        cell.style.minWidth = '110px';
        cell.style.maxWidth = '190px';
        cell.style.whiteSpace = 'nowrap';
        cell.style.overflow = 'hidden';
        cell.style.textOverflow = 'ellipsis';
      }

      // Make TradeID and Action cells compact in the body
      if (column.key === 'Action' || column.key === 'TradeID') {
        cell.style.maxWidth = '80px';
        cell.style.whiteSpace = 'nowrap';
        cell.style.overflow = 'hidden';
        cell.style.textOverflow = 'ellipsis';
      }
      
      // For Running Total column, display running totals
      if (column.key === 'RunningTotal') {
        const runningTotal = runningTotals[rowIndex];
        // Show amount with 2 decimals precision, rounded
        let amt = Math.round(runningTotal.amount * 100) / 100;
        let amountStr: string;
        if (amt === 0) {
          amountStr = '$0.00';
        } else if (amt < 0) {
          amountStr = `($${Math.abs(amt).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`;
        } else {
          amountStr = `$${amt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        }
        // Show no decimals when quantity has no fractional part; otherwise show two decimals
        const qty = runningTotal.quantity;
        const qtyDisplay = Math.abs(qty - Math.round(qty)) < 1e-8
          ? numberFormatterNoDecimals.format(qty)
          : numberFormatter.format(qty);
        const quantityStr = `Qty: ${qtyDisplay}`;
        cell.style.whiteSpace = 'pre-line';
        cell.textContent = `${amountStr}\n${quantityStr}`;
        tr.appendChild(cell);
        return;
      }
      
      const displayValue = column.formatter ? column.formatter(row) : String(row[column.key as keyof OrderRow] ?? '');
      
      // For BrokerOrderID column, render a red 'ADJUSTED' badge under the ID when ManuallyAdjusted === true
      if (column.key === 'BrokerOrderID') {
        const wrapperDiv = document.createElement('div');
        const idDiv = document.createElement('div');
        idDiv.textContent = displayValue;
        wrapperDiv.appendChild(idDiv);

        if ((row as any).ManuallyAdjusted === true) {
          const badgeDiv = document.createElement('div');
          const badge = document.createElement('span');
          badge.className = 'badge mt-1 badge-adjusted';
          badge.style.border = '1px solid rgba(0,0,0,0.05)';
          badge.textContent = 'ADJUSTED';
          // If AdjustedComment exists, add it as a title for hover tooltip
          if ((row as any).AdjustedComment) {
            badge.title = (row as any).AdjustedComment;
            badge.style.cursor = 'help';
          }
          badgeDiv.appendChild(badge);
          wrapperDiv.appendChild(badgeDiv);
        }

        cell.appendChild(wrapperDiv);
        tr.appendChild(cell);
        return; // continue to next column
      }

      // For Trade ID column, render badge under the ID indicating trade status (without the word 'Trade')
      if (column.key === 'TradeID') {
        const wrapperDiv = document.createElement('div');
        const idDiv = document.createElement('div');
        idDiv.innerHTML = displayValue;
        wrapperDiv.appendChild(idDiv);

        // Determine status: incomplete -> 'incomplete'; else if TradeID exists then
        // TradeCloseDate null -> 'open' else 'closed'; if no TradeID -> 'open'
        let status: 'open' | 'closed' | 'incomplete' = 'open';
        if (row.IncompleteTrade) {
          status = 'incomplete';
        } else if (row.TradeID !== null) {
          status = row.TradeCloseDate === null || row.TradeCloseDate === undefined ? 'open' : 'closed';
        } else {
          status = 'open';
        }

        const badgeDiv = document.createElement('div');
        const badge = document.createElement('span');
        badge.className = 'badge mt-1';
        if (status === 'open') {
          badge.classList.add('badge-open');
        } else if (status === 'closed') {
          badge.classList.add('badge-closed');
        } else {
          badge.classList.add('badge-incomplete');
        }
        badge.style.border = '1px solid rgba(0,0,0,0.05)';
        if (status === 'incomplete') {
          badge.textContent = 'INCOMPLETE';
        } else if (status === 'open') {
          badge.textContent = 'OPEN';
        } else {
          badge.textContent = 'CLOSED';
        }
        badgeDiv.appendChild(badge);
        wrapperDiv.appendChild(badgeDiv);

        cell.appendChild(wrapperDiv);
        tr.appendChild(cell);
        return; // continue to next column
      }
      
      // For date columns with line breaks, use white-space: pre-line
      if (column.key === 'ExecutedTime') {
        cell.style.whiteSpace = 'pre-line';
      }
      
      // Create static anchor links for AccountID
      const columnKey = column.key as string;
      if (columnKey === 'AccountID') {
        const wrapperDiv = document.createElement('div');
        const accountDiv = document.createElement('div');
        if (row.AccountID) {
          const link = document.createElement('a');
          link.href = `/accountHistory?accountId=${row.AccountID}`;
          link.className = 'text-decoration-none';
          link.style.color = 'inherit';
          link.textContent = displayValue;
          accountDiv.appendChild(link);
        } else {
          accountDiv.textContent = displayValue;
        }
        wrapperDiv.appendChild(accountDiv);

        const brokerName = brokerMap.get(row.BrokerID) ?? (row.BrokerID ? `Broker ${row.BrokerID}` : null);
        if (brokerName) {
          const brokerDiv = document.createElement('div');
          brokerDiv.style.fontSize = '0.75rem';
          brokerDiv.style.fontStyle = 'italic';
          brokerDiv.style.color = '#6c757d';
          brokerDiv.style.marginTop = '2px';
          const brokerLink = document.createElement('a');
          brokerLink.href = `/accountHistory?brokerId=${row.BrokerID}`;
          brokerLink.className = 'text-decoration-none';
          brokerLink.style.color = '#6c757d';
          brokerLink.textContent = brokerName;
          brokerDiv.appendChild(brokerLink);
          wrapperDiv.appendChild(brokerDiv);
        }
        cell.appendChild(wrapperDiv);
      } else {
        // For cells that may contain HTML (e.g., column.formatter generated anchor), insert as HTML
        const hasHtml = /<\/?[a-z][\s\S]*>/i.test(String(displayValue));
        if (hasHtml) {
          cell.innerHTML = String(displayValue);
        } else {
          cell.textContent = String(displayValue);
        }
      }
      tr.appendChild(cell);
    });

    tbody.appendChild(tr);
  });

  table.appendChild(thead);
  table.appendChild(tbody);
  wrapper.appendChild(table);
  ensureRenderRowCount(wrapper, orders.length);

  mountPoint.innerHTML = '';
  mountPoint.appendChild(wrapper);
};

const renderError = (mountPoint: HTMLElement, message: string) => {
  mountPoint.innerHTML = '';
  const alert = document.createElement('div');
  alert.className = 'alert alert-warning mb-0';
  alert.role = 'alert';
  alert.textContent = message;
  mountPoint.appendChild(alert);
};

const showConfirmModal = (title: string, message: string, confirmText: string = 'Continue', cancelText: string = 'Cancel'): Promise<boolean> => {
  return new Promise((resolve) => {
    const modalId = 'confirmModal-' + Date.now();
    const modalHtml = `
      <div class="modal fade" id="${modalId}" tabindex="-1" aria-labelledby="${modalId}Label" aria-hidden="true">
        <div class="modal-dialog">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title" id="${modalId}Label">${title}</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body">
              ${message}
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">${cancelText}</button>
              <button type="button" class="btn btn-primary" data-confirm="true">${confirmText}</button>
            </div>
          </div>
        </div>
      </div>
    `;
    
    const container = document.createElement('div');
    container.innerHTML = modalHtml;
    document.body.appendChild(container);
    
    const modalElement = document.getElementById(modalId)!;
    const modal = new (window as any).bootstrap.Modal(modalElement);
    
    const confirmButton = modalElement.querySelector('[data-confirm="true"]');
    const cleanup = () => {
      modal.hide();
      setTimeout(() => {
        document.body.removeChild(container);
      }, 300);
    };
    
    confirmButton?.addEventListener('click', () => {
      cleanup();
      resolve(true);
    });
    
    modalElement.addEventListener('hidden.bs.modal', () => {
      cleanup();
      resolve(false);
    }, { once: true });
    
    modal.show();
  });
};

const fetchOrdersData = async (
  sort: SortState,
  actionFilter: ActionFilterValue,
  tradeStatusFilter: TradeStatusFilterValue,
  accountId: number | null,
  brokerId: number | null,
  symbol: string | null,
  tradeId: number | null,
  brokerOrderId: number | null,
  orderId: number | null,
  dateRange: string,
  executedDate: string | null
): Promise<OrdersApiResponse> => {
  const params = new URLSearchParams({
    sortKey: sort.key,
    sortDirection: sort.direction,
    actionFilter: actionFilter,
    tradeStatusFilter: tradeStatusFilter,
    dateRange: dateRange
  });
  
  if (accountId !== null) {
    params.set('accountId', accountId.toString());
  }
  
  if (brokerId !== null) {
    params.set('brokerId', brokerId.toString());
  }
  
  if (symbol !== null) {
    params.set('symbol', symbol);
  }

  if (tradeId !== null) {
    params.set('tradeId', tradeId.toString());
  }

  if (brokerOrderId !== null) {
    params.set('brokerOrderId', brokerOrderId.toString());
  }

  if (orderId !== null) {
    params.set('orderId', orderId.toString());
  }

  if (executedDate !== null) {
    params.set('executedDate', executedDate);
  }

  const response = await fetch(`${REQUEST_ENDPOINT}?${params.toString()}`, {
    headers: {
      Accept: 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to load orders (${response.status})`);
  }

  return response.json() as Promise<OrdersApiResponse>;
};

const setLoadingState = (mountPoint: HTMLElement, message: string = 'Loading Orders...') => {
  mountPoint.innerHTML = `
    <div class="text-center py-5">
      <div class="spinner-border spinner-border-sm text-secondary me-2" role="status"></div>
      <span class="fs-5 text-muted align-middle">${message}</span>
    </div>
  `;
};

const DEFAULT_SORT: SortState = { key: 'OrderID', direction: 'desc' };
const DEFAULT_ACTION_FILTER: ActionFilterValue = 'all';
const DEFAULT_TRADE_STATUS_FILTER: TradeStatusFilterValue = 'all';
const DEFAULT_DATE_RANGE = 'LAST_30_DAYS';

const initializeOrdersTable = (mountPoint: HTMLElement) => {
  // Check for query string parameters (for cross-linking)
  const urlParams = new URLSearchParams(window.location.search);
  const tradeIdParam = urlParams.get('tradeId');
  const accountIdParam = urlParams.get('accountId');
  const executedDateParam = urlParams.get('executedDate');
  
  // Initialize with defaults
  let sort = DEFAULT_SORT;
  let actionFilter = DEFAULT_ACTION_FILTER;
  let tradeStatusFilter = DEFAULT_TRADE_STATUS_FILTER;
  let accountId: number | null = null;
  let brokerId: number | null = null;
  let symbol: string | null = null;
  let tradeId: number | null = null;
  let brokerOrderId: number | null = null;
  let orderId: number | null = null;
  let dateRange = DEFAULT_DATE_RANGE;
  // When linking from a Trade, default the view into Running Totals mode
  // and apply that into the initial state below.
  let showRunningTotalsDefault = false;
  
  // If tradeId is in query string, override default settings and enable Running Totals
  // feature by sorting by ExecutedTime ascending and enabling the Running Totals view.
  // Also remove the default date filter so the Orders page shows all related orders for
  // the trade regardless of age.
  if (tradeIdParam) {
    const parsedTradeId = parseInt(tradeIdParam, 10);
    if (!isNaN(parsedTradeId) && parsedTradeId > 0) {
      sort = { key: 'ExecutedTime', direction: 'asc' };
      tradeId = parsedTradeId;
      // When coming from a Trade link, show all orders for the trade (no date filter)
      dateRange = 'ALL';
      // Default into Running Totals mode when linking from a Trade
      showRunningTotalsDefault = true;
    }
  }

  // If executedDate is in query string (coming from Orders Placed link),
  // set filters accordingly
  else if (executedDateParam !== null && executedDateParam !== '') {
    let parsedAccount: number | null = null;
    if (accountIdParam !== null && accountIdParam !== 'all' && accountIdParam !== '') {
      const p = parseInt(accountIdParam, 10);
      if (!isNaN(p)) parsedAccount = p;
    }

    accountId = parsedAccount;
  }

  // If accountId is in query string (coming from cross-page navigation),
  // reset filters except the account filter. Support 'all' to clear the account filter.
  else if (accountIdParam !== null) {
    let parsedAccount: number | null = null;
    if (accountIdParam !== 'all' && accountIdParam !== '') {
      const p = parseInt(accountIdParam, 10);
      if (!isNaN(p)) parsedAccount = p;
    }

    accountId = parsedAccount;
  }
  
  // Read brokerId from URL if present
  const brokerIdParam = urlParams.get('brokerId');
  if (brokerIdParam && brokerIdParam !== 'all' && brokerIdParam !== '') {
    const parsed = parseInt(brokerIdParam, 10);
    if (!isNaN(parsed)) brokerId = parsed;
  }
  
  // Read symbol from URL if present
  const symbolParam = urlParams.get('symbol');
  if (symbolParam && symbolParam !== 'all' && symbolParam !== '') {
    symbol = symbolParam;
  }
  
  const state: {
    orders: OrderRow[];
    asOf: string;
    sort: SortState;
    actionFilter: ActionFilterValue;
    tradeStatusFilter: TradeStatusFilterValue;
    accountId: number | null;
    brokerId: number | null;
    symbol: string | null;
    tradeId: number | null;
    brokerOrderId: number | null;
    orderId: number | null;
    dateRange: string;
    executedDate: string | null;
    distinctSymbols: string[];
    distinctActions: string[];
    showRunningTotals: boolean;
  } = {
    orders: [],
    asOf: '',
    sort,
    actionFilter,
    tradeStatusFilter,
    accountId,
    brokerId,
    symbol,
    tradeId,
    brokerOrderId,
    orderId,
    dateRange,
    executedDate: executedDateParam || null,
    distinctSymbols: [],
    distinctActions: [],
    showRunningTotals: showRunningTotalsDefault
  };
  
  // Helper function to determine if Running Totals feature is enabled
  const isRunningTotalsEnabled = (): boolean => {
    // Feature is enabled when filtering by a specific symbol OR a specific trade ID
    return state.symbol !== null || state.tradeId !== null;
  };

  const handleResetFilters = () => {
    if (bookmarkBar) bookmarkBar.clearSelection();
    state.actionFilter = 'all';
    state.tradeStatusFilter = 'all';
    state.accountId = null;
    state.brokerId = null;
    state.symbol = null;
    state.tradeId = null;
    state.brokerOrderId = null;
    state.orderId = null;
    state.dateRange = 'LAST_30_DAYS';
    state.executedDate = null;
    state.sort = DEFAULT_SORT;
    state.showRunningTotals = false;
    void load(DEFAULT_SORT);
  };

  // Bookmark bar integration (uses reusable client-side BookmarkBar)
  const bookmarkBar = (window as any).BookmarkBar ? new (window as any).BookmarkBar(
    'OrdersViewState',
    (savedState: any) => {
      // Apply saved state into local state then reload
      state.sort = savedState.sort;
      state.actionFilter = savedState.actionFilter;
      state.tradeStatusFilter = savedState.tradeStatusFilter;
      state.accountId = savedState.accountId;
      state.brokerId = savedState.brokerId;
      state.symbol = savedState.symbol;
      state.tradeId = savedState.tradeId;
      state.brokerOrderId = savedState.brokerOrderId;
      state.orderId = savedState.orderId;
      state.dateRange = savedState.dateRange || 'LAST_30_DAYS';
      // Ensure UI dropdown reflects restored dateRange if present
      try {
        const dropdown = (window as any).DateRangeDropdownInstance as any;
        if (dropdown && state.dateRange) {
          dropdown.setAccountId(state.accountId ?? null);
          dropdown.setValue(state.dateRange);
        }
      } catch {}
      void load();
    },
    () => {
      return {
        sort: state.sort,
        actionFilter: state.actionFilter,
        tradeStatusFilter: state.tradeStatusFilter,
        accountId: state.accountId,
        brokerId: state.brokerId,
        symbol: state.symbol,
        tradeId: state.tradeId,
        brokerOrderId: state.brokerOrderId,
        orderId: state.orderId,
        dateRange: state.dateRange
      };
    },
    handleResetFilters,
    (window as any).LUMOS_DEMO_MODE || false
  ) : null;
  // Expose a small renderer function so the top-level `renderOrdersTable` can
  // call into this closure to render the bookmark bar (avoids changing many
  // function signatures).
  (window as any).__renderOrdersBookmarkBar = (container: HTMLElement) => {
    if (bookmarkBar) bookmarkBar.render(container);
  };

  const handleSort = (columnKey: ColumnKey) => {
    if (bookmarkBar) bookmarkBar.clearSelection();
    const nextSort: SortState =
      state.sort.key === columnKey
        ? {
            key: columnKey,
            direction: state.sort.direction === 'asc' ? 'desc' : 'asc'
          }
        : { key: columnKey, direction: 'asc' };

    // Hide running totals unless sorting by Filled ascending and feature is enabled
    state.showRunningTotals = false;
    if (isRunningTotalsEnabled() && nextSort.key === 'ExecutedTime' && nextSort.direction === 'asc') {
      state.showRunningTotals = true;
    }
    void load(nextSort);
  };

  const handleActionFilterChange = (filter: ActionFilterValue) => {
    if (bookmarkBar) bookmarkBar.clearSelection();
    state.actionFilter = filter;
    // Keep running totals visible if feature is enabled and on Filled ascending sort
    if (!isRunningTotalsEnabled() || state.sort.key !== 'ExecutedTime' || state.sort.direction !== 'asc') {
      state.showRunningTotals = false;
    }
    void load();
  };

  const handleTradeStatusFilterChange = (filter: TradeStatusFilterValue) => {
    if (bookmarkBar) bookmarkBar.clearSelection();
    state.tradeStatusFilter = filter;
    // Keep running totals visible if feature is enabled and on Filled ascending sort
    if (!isRunningTotalsEnabled() || state.sort.key !== 'ExecutedTime' || state.sort.direction !== 'asc') {
      state.showRunningTotals = false;
    }
    void load();
  };

  const handleAccountFilterChange = (accountId: number | null) => {
    if (bookmarkBar) bookmarkBar.clearSelection();
    state.accountId = accountId;
    state.brokerId = null;
    // Keep running totals visible if feature is enabled and on Filled ascending sort
    if (!isRunningTotalsEnabled() || state.sort.key !== 'ExecutedTime' || state.sort.direction !== 'asc') {
      state.showRunningTotals = false;
    }
    void load();
  };

  const handleBrokerIdChange = (brokerId: number | null) => {
    if (bookmarkBar) bookmarkBar.clearSelection();
    state.brokerId = brokerId;
    state.accountId = null;
    // Keep running totals visible if feature is enabled and on Filled ascending sort
    if (!isRunningTotalsEnabled() || state.sort.key !== 'ExecutedTime' || state.sort.direction !== 'asc') {
      state.showRunningTotals = false;
    }
    void load();
  };

  const handleSymbolFilterChange = (symbol: string | null) => {
    if (bookmarkBar) bookmarkBar.clearSelection();
    state.symbol = symbol;
    // Hide running totals unless still on Filled ascending sort and feature is enabled
    if (!isRunningTotalsEnabled() || state.sort.key !== 'ExecutedTime' || state.sort.direction !== 'asc') {
      state.showRunningTotals = false;
    }
    void load();
  };

  const handleTradeIdFilterChange = (tradeId: number | null) => {
    if (bookmarkBar) bookmarkBar.clearSelection();
    state.tradeId = tradeId;
    // Keep running totals visible if feature is enabled and on Filled ascending sort
    if (!isRunningTotalsEnabled() || state.sort.key !== 'ExecutedTime' || state.sort.direction !== 'asc') {
      state.showRunningTotals = false;
    }
    void load();
  };

  const handleBrokerOrderIdFilterChange = (brokerOrderId: number | null) => {
    if (bookmarkBar) bookmarkBar.clearSelection();
    state.brokerOrderId = brokerOrderId;
    // Keep running totals visible if feature is enabled and on Filled ascending sort
    if (!isRunningTotalsEnabled() || state.sort.key !== 'ExecutedTime' || state.sort.direction !== 'asc') {
      state.showRunningTotals = false;
    }
    void load();
  };

  const handleDateRangeChange = (dateRange: string) => {
    if (bookmarkBar) bookmarkBar.clearSelection();
    state.dateRange = dateRange;
    // Clear executedDate when user selects a preset filter
    state.executedDate = null;
    // Keep running totals visible if feature is enabled and on Filled ascending sort
    if (!isRunningTotalsEnabled() || state.sort.key !== 'ExecutedTime' || state.sort.direction !== 'asc') {
      state.showRunningTotals = false;
    }
    void load();
  };
  
  const handleRunningTotals = () => {
    state.showRunningTotals = true;
    void load({ key: 'ExecutedTime', direction: 'asc' });
  };

  const handleImportOrders = async () => {
    try {
      setLoadingState(mountPoint);
      const response = await fetch('/request/importOrders', { method: 'POST' });
      const result = await response.json();
      await load(); // Reload the data
      if (!result.success && result.error) {
        (window as any).LumosErrorUtils.displayDismissibleError(mountPoint, result.error, 'Resync Brokers completed with errors');
      }
    } catch (error) {
      console.error('Resynchronizing brokers (orders) error:', error);
      await load(); // Reload to show current state
    }
  };

  const load = async (sortOverride?: SortState) => {
    const sortToUse = sortOverride ?? state.sort ?? DEFAULT_SORT;
    state.sort = sortToUse; // Update state with the sort being used
    let loadingTimer: number | null = window.setTimeout(() => setLoadingState(mountPoint), 250);
    try {
      const data = await fetchOrdersData(
        sortToUse, 
        state.actionFilter, 
        state.tradeStatusFilter, 
        state.accountId, 
        state.brokerId,
        state.symbol, 
        state.tradeId,
        state.brokerOrderId,
        state.orderId,
        state.dateRange,
        state.executedDate
      );
      
      if (loadingTimer) { clearTimeout(loadingTimer); loadingTimer = null; }
      state.orders = data.orders;
      state.asOf = data.asOf;
      
      // Extract distinct symbols from orders and sort alphabetically
      const symbolSet = new Set<string>();
      data.orders.forEach(order => {
        if (order.Symbol) {
          symbolSet.add(order.Symbol);
        }
      });
      state.distinctSymbols = Array.from(symbolSet).sort();
      
      // Extract distinct actions from orders and sort alphabetically
      const actionSet = new Set<string>();
      data.orders.forEach(order => {
        if (order.Action) {
          actionSet.add(order.Action);
        }
      });
      state.distinctActions = Array.from(actionSet).sort();
      
      // Check if Running Totals feature should be enabled
      const runningTotalsEnabled = isRunningTotalsEnabled();
      
      // If feature is not enabled, turn off showRunningTotals
      if (!runningTotalsEnabled) {
        state.showRunningTotals = false;
      }
      
      // Only show running totals if explicitly enabled and on Filled ascending sort
      if (state.showRunningTotals && (!runningTotalsEnabled || state.sort.key !== 'ExecutedTime' || state.sort.direction !== 'asc')) {
        state.showRunningTotals = false;
      }
      
      renderOrdersTable(
        mountPoint,
        state.orders,
        state.asOf,
        state.sort,
        state.actionFilter,
        state.tradeStatusFilter,
        state.accountId,
        state.brokerId,
        state.symbol,
        state.tradeId,
        state.brokerOrderId,
        state.orderId,
        state.dateRange,
        state.executedDate,
        state.distinctSymbols,
        state.distinctActions,
        state.showRunningTotals,
        runningTotalsEnabled,
        handleSort,
        handleActionFilterChange,
        handleTradeStatusFilterChange,
        handleAccountFilterChange,
        handleBrokerIdChange,
        handleSymbolFilterChange,
        handleTradeIdFilterChange,
        handleBrokerOrderIdFilterChange,
        handleDateRangeChange,
        handleImportOrders,
        handleRunningTotals
      );
      
      // Re-initialize dateRangeDropdown after each render
      initializeDateRangeDropdown();
    } catch (error) {
      if (loadingTimer) { clearTimeout(loadingTimer); loadingTimer = null; }
      console.error('[ordersClient] Failed to render orders table', error);
      renderError(mountPoint, 'Unable to load orders right now. Please try again later.');
    }
  };
  
  // Helper function to initialize/re-initialize the dateRangeDropdown
  const MILESTONES = (window as any).lumos?.milestones || [];
  let dateRangeDropdown: any = null;
  const initializeDateRangeDropdown = () => {
    if ((window as any).DateRangeDropdown) {
      dateRangeDropdown = new (window as any).DateRangeDropdown({
        containerId: 'orders-date-range-dropdown',
        searchInputId: 'orders-date-range-search',
        listContainerId: 'orders-date-range-list',
        labelElementId: 'orders-date-range-label',
        milestones: MILESTONES,
        defaultValue: state.dateRange,
        accountId: state.accountId,
        onChange: (value: string) => {
          handleDateRangeChange(value);
        }
      });
    }
  };

  void load(state.sort);
  
  // Wire up the Orders title click to reset filters
  const ordersTitle = document.getElementById('orders-title');
  if (ordersTitle) {
    ordersTitle.addEventListener('click', () => {
      handleResetFilters();
    });
  }
  
  // Return the load function so external refresh can call it
  return load;
};

document.addEventListener('DOMContentLoaded', () => {
  const mountPoint = document.querySelector<HTMLElement>('[data-orders-table-root]');
  if (!mountPoint) {
    return;
  }

  initializeOrdersTable(mountPoint);
});

}
