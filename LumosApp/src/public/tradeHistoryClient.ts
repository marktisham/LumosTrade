// Wrap in IIFE to avoid global scope conflicts with other client files
(function() {

// Access Highcharts from window object (loaded via CDN)
const Highcharts = (window as any).Highcharts;

// Access Milestones from window object
const MILESTONES = (window as any).lumos?.milestones || [];

// Type definitions for external dependencies (loaded separately)
interface DropdownOption {
  value: string;
  label: string;
  group?: string;
  labelHtml?: string;
}

type TradeHistoryRow = {
  TradeHistoryID: number | null;
  AccountID: number;
  TradeID: number;
  AccountName: string;
  BrokerID: number | null;
  BrokerName: string | null;
  Symbol: string;
  Closed: boolean;
  RollupPeriod: number;
  PeriodEnd: string;
  PeriodGain: number | null;
  PeriodGainPct: number | null;
  TotalGain: number | null;
  TotalGainPct: number | null;
  LargestRisk: number | null;
  CurrentValue: number | null;
  CurrentCost: number | null;
  AvgEntryPrice: number | null;
  AvgExitPrice: number | null;
  LongTrade: boolean | null;
  CurrentPriceAtPeriodEnd: number | null;
  OpenQuantityAtPeriodEnd: number | null;
  BreakevenPriceAtPeriodEnd: number | null;
  RealizedGainAtPeriodEnd: number | null;
  UnrealizedGainAtPeriodEnd: number | null;
};

type SortDirection = 'asc' | 'desc';
type ColumnKey = keyof TradeHistoryRow;
type ClosedState = 'all' | 'open' | 'closed';

type SortState = {
  key: ColumnKey;
  direction: SortDirection;
};

type RollupPeriod = 1 | 2 | 3; // Daily = 1, Weekly = 2, Monthly = 3
type ViewMode = 'table' | 'chart';
type ChartType = 'tradeValue' | 'tradeValueStacked' | 'tradeGain' | 'tradeGainStacked' | 'periodGain' | 'periodSymbolGain';

const DEFAULT_SORT: SortState = { key: 'AccountName', direction: 'asc' };
const DEFAULT_ROLLUP_PERIOD: RollupPeriod = 1;
const DEFAULT_CLOSED_STATE: ClosedState = 'all';
const DEFAULT_VIEW_MODE: ViewMode = 'table';
const DEFAULT_CHART_TYPE: ChartType = 'tradeValue';
const DEFAULT_DATE_RANGE = 'LAST_90_DAYS';
const DEFAULT_GROUP_BY: 'symbol' | 'symbolGroup' = 'symbol';

type TradeHistoryApiResponse = {
  asOf: string;
  periodEnd: string;
  periodStart: string;
  isLatestPeriod: boolean;
  rollupPeriod: RollupPeriod;
  tradeHistory: TradeHistoryRow[];
  sort: SortState;
};

type ColumnConfig = {
  key: ColumnKey;
  label: string;
  dataType: 'number' | 'string' | 'date' | 'boolean';
  formatter?: (row: TradeHistoryRow) => string;
  isNumeric?: boolean;
  sortable?: boolean;
  width?: number;
};

const REQUEST_ENDPOINT = '/request/tradeHistory';

const numberFormatter = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const wholeNumberFormatter = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0
});

const formatCurrency = (value: number): string => {
  if (value < 0) {
    return `($${numberFormatter.format(Math.abs(value))})`;
  }
  return `$${numberFormatter.format(value)}`;
};

const formatQuantity = (value: number): string => {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!isFinite(numeric)) return String(value);
  const rounded = Math.round(numeric);
  const isWhole = Math.abs(numeric - rounded) < 1e-8;
  return isWhole ? wholeNumberFormatter.format(rounded) : numberFormatter.format(numeric);
};

const formatPercent = (value: number): string => {
  const pctFormatter = new Intl.NumberFormat(undefined, {
    style: 'percent',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  return pctFormatter.format(value);
};

// Ensure percentages for two-part split are positive and sum to 100 ✅
const computeTwoPartPercentages = (a: number, b: number): [number, number] => {
  const absA = Math.abs(a);
  const absB = Math.abs(b);
  const total = absA + absB;
  if (total === 0) return [0, 0];
  let aPct = Math.round((absA / total) * 100);
  let bPct = Math.round((absB / total) * 100);
  const diff = 100 - (aPct + bPct);
  if (diff !== 0) {
    if (absA >= absB) aPct += diff; else bPct += diff;
  }
  return [aPct, bPct];
};

// Symbol groups from server
type SymbolGroupInfo = {
  ID: number | null;
  Name: string;
  Symbols: string;
};

const lumosSymbolGroups = (window as any).LUMOS_SYMBOL_GROUPS as SymbolGroupInfo[] | undefined;
const lumosAccounts = (window as any).LUMOS_ACCOUNTS as Array<{ AccountID: number | null; Name: string; BrokerID?: number | null }> | undefined;
const lumosBrokers = (window as any).LUMOS_BROKERS as Array<{ BrokerID: number; Name: string }> | undefined;
const brokerNameById = new Map<number, string>();

if (lumosBrokers) {
  lumosBrokers.forEach((broker) => brokerNameById.set(broker.BrokerID, broker.Name));
}

const buildAccountFilterOptions = (): DropdownOption[] => {
  const options: DropdownOption[] = [];
  if (!lumosAccounts || lumosAccounts.length === 0) return options;

  const accountsByBroker = new Map<number | null, Array<{ AccountID: number | null; Name: string; BrokerID?: number | null }>>();
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

  const sortedBrokers = (lumosBrokers ? [...lumosBrokers] : []).sort((a, b) => a.Name.localeCompare(b.Name));
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
  {
    key: 'TradeID',
    label: 'Trade ID',
    dataType: 'number',
    isNumeric: true,
    sortable: true
  },
  { 
    key: 'AccountName', 
    label: 'Account', 
    dataType: 'string', 
    sortable: true 
  },
  { 
    key: 'Symbol', 
    label: 'Symbol', 
    dataType: 'string', 
    sortable: true 
  },
  {
    key: 'Closed',
    label: 'Status',
    dataType: 'boolean',
    sortable: true,
    width: 60,
    formatter: (row) => row.Closed ? 
      '<span class="badge bg-secondary">CLOSED</span>' : 
      '<span class="badge bg-success">OPEN</span>'
  },
  {
    key: 'CurrentCost',
    label: 'Current Cost',
    dataType: 'number',
    isNumeric: true,
    sortable: true,
    formatter: (row) => {
      if (row.Closed) {
        if (row.AvgEntryPrice === null || row.AvgEntryPrice === undefined) return '—';
        return `Avg Entry: ${formatCurrency(row.AvgEntryPrice)}`;
      }
      return (row.CurrentCost === null ? '—' : formatCurrency(row.CurrentCost));
    }
  },
  {
    key: 'CurrentValue',
    label: 'Current Value',
    dataType: 'number',
    isNumeric: true,
    sortable: true,
    formatter: (row) => {
      if (row.Closed) {
        if (row.AvgExitPrice === null || row.AvgExitPrice === undefined) return '—';
        return `Avg Exit: ${formatCurrency(row.AvgExitPrice)}`;
      }
      return (row.CurrentValue === null ? '—' : formatCurrency(row.CurrentValue));
    }
  },
  {
    key: 'PeriodGain',
    label: 'Period Gain',
    dataType: 'number',
    isNumeric: true,
    sortable: true,
    formatter: (row) => {
      if (row.PeriodGain === null) return '—';
      const cls = row.PeriodGain > 0 ? 'val-positive' : (row.PeriodGain < 0 ? 'val-negative' : '');
      return `<span class="${cls}">${formatCurrency(row.PeriodGain)}</span>`;
    }
  },
  {
    key: 'PeriodGainPct',
    label: 'Period Gain %',
    dataType: 'number',
    isNumeric: true,
    sortable: true,
    formatter: (row) => {
      if (row.PeriodGainPct === null) return '—';
      const cls = row.PeriodGainPct > 0 ? 'val-positive' : (row.PeriodGainPct < 0 ? 'val-negative' : '');
      return `<span class="${cls}">${formatPercent(row.PeriodGainPct)}</span>`;
    }
  },
  {
    key: 'TotalGain',
    label: 'Total Gain',
    dataType: 'number',
    isNumeric: true,
    sortable: true,
    formatter: (row) => {
      if (row.TotalGain === null) return '—';
      const cls = row.TotalGain > 0 ? 'val-positive' : (row.TotalGain < 0 ? 'val-negative' : '');
      return `<span class="${cls}">${formatCurrency(row.TotalGain)}</span>`;
    }
  },
  {
    key: 'TotalGainPct',
    label: 'Total Gain %',
    dataType: 'number',
    isNumeric: true,
    sortable: true,
    formatter: (row) => {
      if (row.TotalGainPct === null) return '—';
      const cls = row.TotalGainPct > 0 ? 'val-positive' : (row.TotalGainPct < 0 ? 'val-negative' : '');
      return `<span class="${cls}">${formatPercent(row.TotalGainPct)}</span>`;
    }
  },
];

let currentSortState: SortState = DEFAULT_SORT;
let currentPeriodEnd: string | null = null;
let currentRollupPeriod: RollupPeriod = 1;
let currentSymbol: string | null = null;
let currentAccountID: number | null = null;
let currentClosedState: ClosedState = 'all';
let currentTradeFilterId: number | null = null;
let currentBrokerId: number | null = null;
let currentViewMode: ViewMode = 'table';
let currentChartType: ChartType = 'tradeValue';
let currentDateRange: string = DEFAULT_DATE_RANGE;
let currentGroupBy: 'symbol' | 'symbolGroup' = 'symbol';
let distinctSymbols: string[] = [];
let tradeHistoryChart: any = null;
// Reuse a single BookmarkBar instance to avoid repeated network fetches
let tradeHistoryBookmarkBar: any = null;
let dateRangeDropdown: any = null;

const fetchTradeHistoryData = async (
  sortState: SortState,
  periodEnd?: string,
  rollupPeriod: RollupPeriod = 1,
  symbol: string | null = null,
  accountID: number | null = null,
  closedState: ClosedState = 'all',
  operation?: 'previous' | 'next',
  dateRange?: string,
  chartType?: ChartType,
  brokerId?: number | null,
  groupBy: 'symbol' | 'symbolGroup' = 'symbol'
): Promise<TradeHistoryApiResponse> => {
  const params = new URLSearchParams();
  params.set('sortKey', sortState.key);
  params.set('sortDirection', sortState.direction);
  if (periodEnd && !dateRange) {
    params.set('periodEnd', periodEnd);
  }
  params.set('rollupPeriod', String(rollupPeriod));
  params.set('groupBy', groupBy);
  
  if (brokerId !== null && brokerId !== undefined) {
    params.set('brokerId', brokerId.toString());
  }
  
  if (dateRange) {
    params.set('dateRange', dateRange);
    
    // Add column filter for optimization based on chart type
    if (chartType === 'tradeValue' || chartType === 'tradeValueStacked') {
      params.set('columns', 'TradeID,Symbol,PeriodEnd,CurrentValue');
    } else if (chartType === 'tradeGain' || chartType === 'tradeGainStacked') {
      params.set('columns', 'TradeID,Symbol,AccountID,AccountName,PeriodEnd,TotalGain,RealizedGainAtPeriodEnd,UnrealizedGainAtPeriodEnd');
    } else if (chartType === 'periodGain' || chartType === 'periodSymbolGain') {
      params.set('columns', 'TradeID,Symbol,PeriodEnd,PeriodGain');
    }
  }
  
  // Handle symbol groups (prefixed with 'group:') and individual symbols
  if (symbol) {
    if (symbol.startsWith('group:')) {
      const groupId = parseInt(symbol.substring(6), 10);
      const symbolGroup = lumosSymbolGroups?.find(sg => sg.ID === groupId);
      if (symbolGroup && symbolGroup.Symbols) {
        const symbols = symbolGroup.Symbols.split(',').map(s => s.trim());
        symbols.forEach(s => params.append('symbols', s));
      }
    } else {
      params.set('symbol', symbol);
    }
  }
  
  if (accountID !== null) {
    params.set('accountId', accountID.toString());
  }
  
  if (closedState && closedState !== 'all') {
    params.set('closedState', closedState);
  }
  
  if (operation) {
    params.set('op', operation);
  }

  const response = await fetch(`${REQUEST_ENDPOINT}?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch trade history: ${response.statusText}`);
  }
  return await response.json();
};

const handleSort = (key: ColumnKey) => {
  if (tradeHistoryBookmarkBar) tradeHistoryBookmarkBar.clearSelection();
  if (currentSortState.key === key) {
    currentSortState.direction = currentSortState.direction === 'asc' ? 'desc' : 'asc';
  } else {
    currentSortState = { key, direction: 'asc' };
  }
  loadTradeHistoryData(currentPeriodEnd || undefined, currentRollupPeriod, currentSymbol, currentAccountID, currentClosedState, undefined, currentGroupBy);
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

const handleReset = () => {
  if (tradeHistoryBookmarkBar) tradeHistoryBookmarkBar.clearSelection();
  currentSortState = DEFAULT_SORT;
  currentPeriodEnd = null;
  currentRollupPeriod = 1;
  currentSymbol = null;
  currentAccountID = null;
  currentClosedState = 'all';
  currentDateRange = DEFAULT_DATE_RANGE;
  currentBrokerId = null;
  currentGroupBy = 'symbol';
  currentTradeFilterId = null; // Reset tradeId filter as well
  if (dateRangeDropdown) {
    dateRangeDropdown.setAccountId(null);
    dateRangeDropdown.setValue('LAST_90_DAYS');
  }
  loadTradeHistoryData(undefined, currentRollupPeriod, currentSymbol, currentAccountID, currentClosedState, undefined, currentGroupBy);
};

const handlePreviousPeriod = () => {
  if (tradeHistoryBookmarkBar) tradeHistoryBookmarkBar.clearSelection();
  if (!currentPeriodEnd) {
    loadTradeHistoryData(undefined, currentRollupPeriod, currentSymbol, currentAccountID, currentClosedState, undefined, currentGroupBy);
    return;
  }
  
  loadTradeHistoryData(currentPeriodEnd, currentRollupPeriod, currentSymbol, currentAccountID, currentClosedState, 'previous', currentGroupBy);
};

const handleNextPeriod = () => {
  if (tradeHistoryBookmarkBar) tradeHistoryBookmarkBar.clearSelection();
  if (!currentPeriodEnd) {
    loadTradeHistoryData(undefined, currentRollupPeriod, currentSymbol, currentAccountID, currentClosedState, undefined, currentGroupBy);
    return;
  }
  
  loadTradeHistoryData(currentPeriodEnd, currentRollupPeriod, currentSymbol, currentAccountID, currentClosedState, 'next', currentGroupBy);
};

const handleLatestPeriod = () => {
  if (tradeHistoryBookmarkBar) tradeHistoryBookmarkBar.clearSelection();
  currentPeriodEnd = null;
  loadTradeHistoryData(undefined, currentRollupPeriod, currentSymbol, currentAccountID, currentClosedState, undefined, currentGroupBy);
};

const handleRollupPeriodChange = (rollupPeriod: RollupPeriod) => {
  if (tradeHistoryBookmarkBar) tradeHistoryBookmarkBar.clearSelection();
  currentRollupPeriod = rollupPeriod;
  currentPeriodEnd = null;
  loadTradeHistoryData(undefined, currentRollupPeriod, currentSymbol, currentAccountID, currentClosedState, undefined, currentGroupBy);
};

const handleGroupByChange = (groupBy: 'symbol' | 'symbolGroup') => {
  console.log('[tradeHistoryClient] Group by changed to:', groupBy);
  if (tradeHistoryBookmarkBar) tradeHistoryBookmarkBar.clearSelection();
  currentGroupBy = groupBy;
  console.log('[tradeHistoryClient] Loading trade history data with groupBy:', currentGroupBy);
  loadTradeHistoryData(currentPeriodEnd || undefined, currentRollupPeriod, currentSymbol, currentAccountID, currentClosedState, undefined, currentGroupBy);
};

const handleSymbolFilterChange = (symbol: string | null) => {
  if (tradeHistoryBookmarkBar) tradeHistoryBookmarkBar.clearSelection();
  currentSymbol = symbol;
  loadTradeHistoryData(currentPeriodEnd || undefined, currentRollupPeriod, currentSymbol, currentAccountID, currentClosedState, undefined, currentGroupBy);
};

const handleAccountFilterChange = (accountID: number | null) => {
  if (tradeHistoryBookmarkBar) tradeHistoryBookmarkBar.clearSelection();
  currentAccountID = accountID;
  currentBrokerId = null;
  loadTradeHistoryData(currentPeriodEnd || undefined, currentRollupPeriod, currentSymbol, currentAccountID, currentClosedState, undefined, currentGroupBy);
};

const handleClosedStateChange = (closedState: ClosedState) => {
  if (tradeHistoryBookmarkBar) tradeHistoryBookmarkBar.clearSelection();
  currentClosedState = closedState;
  loadTradeHistoryData(currentPeriodEnd || undefined, currentRollupPeriod, currentSymbol, currentAccountID, currentClosedState, undefined, currentGroupBy);
};

const handleTradeIdFilterChange = (tradeId: number | null) => {
  if (tradeHistoryBookmarkBar) tradeHistoryBookmarkBar.clearSelection();
  currentTradeFilterId = tradeId;
  loadTradeHistoryData(currentPeriodEnd || undefined, currentRollupPeriod, currentSymbol, currentAccountID, currentClosedState, undefined, currentGroupBy);
};

const renderStatsSection = (container: HTMLElement, tradeHistory: TradeHistoryRow[], asOf: string, rollupPeriod: RollupPeriod) => {
  const statsWrapper = document.createElement('div');
  statsWrapper.className = 'mb-4';
  
  if (tradeHistory.length === 0) {
    const alert = document.createElement('div');
    alert.className = 'alert alert-info mb-3';
    alert.innerHTML = `
      <div class="d-flex align-items-center">
        <div class="me-3" style="font-size: 2rem;">ℹ️</div>
        <div>
          <strong>No trade history to display</strong>
        </div>
      </div>
    `;
    statsWrapper.appendChild(alert);
    container.appendChild(statsWrapper);
    return;
  }
  
  // Calculate stats (coerce to Number and filter invalids to avoid NaN)
  const periodGainValues = tradeHistory
    .map(t => Number(t.PeriodGain))
    .filter(Number.isFinite);
  const totalPeriodGain = periodGainValues.reduce((sum, val) => sum + val, 0);

  const periodGainPctValues = tradeHistory
    .map(t => Number(t.PeriodGainPct))
    .filter(Number.isFinite);
  const avgPeriodGainPct = periodGainPctValues.length > 0 ? periodGainPctValues.reduce((s, v) => s + v, 0) / periodGainPctValues.length : null;

  const totalGainValues = tradeHistory
    .map(t => Number(t.TotalGain))
    .filter(Number.isFinite);
  const totalTotalGain = totalGainValues.reduce((sum, val) => sum + val, 0);

  const totalGainPctValues = tradeHistory
    .map(t => Number(t.TotalGainPct))
    .filter(Number.isFinite);
  const avgTotalGainPct = totalGainPctValues.length > 0 ? totalGainPctValues.reduce((s, v) => s + v, 0) / totalGainPctValues.length : null;

  const currentCostValues = tradeHistory
    .map(t => Number(t.CurrentCost))
    .filter(Number.isFinite);
  const totalCurrentCost = currentCostValues.reduce((sum, val) => sum + val, 0);

  const currentValueValues = tradeHistory
    .map(t => Number(t.CurrentValue))
    .filter(Number.isFinite);
  const totalCurrentValue = currentValueValues.reduce((sum, val) => sum + val, 0);

  const periodPositive = totalPeriodGain > 0;
  const periodNegative = totalPeriodGain < 0;
  const periodCardStateClass = periodPositive ? 'success' : (periodNegative ? 'danger' : '');
  const periodPctClass = periodPositive ? 'text-success' : (periodNegative ? 'text-danger' : '');

  const totalGainPositive = totalTotalGain > 0;
  const totalGainNegative = totalTotalGain < 0;
  const totalPctClass = totalGainPositive ? 'text-success' : (totalGainNegative ? 'text-danger' : '');

  const periodLabel = rollupPeriod === 1 ? 'Daily' : (rollupPeriod === 2 ? 'Weekly' : 'Monthly');

  const statsContent = document.createElement('div');
  statsContent.className = 'row g-3';

  // Helpers for aggregate stats
  const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : null;
  const largest = (arr: number[]) => arr.length > 0 ? Math.max(...arr) : null;
  const smallest = (arr: number[]) => arr.length > 0 ? Math.min(...arr) : null;

  const periodAvg = avg(periodGainValues);
  const periodLargest = largest(periodGainValues);
  const periodSmallest = smallest(periodGainValues);
  const periodLargestPct = periodLargest != null ? Number(tradeHistory.find(t => Number(t.PeriodGain) === periodLargest)?.PeriodGainPct ?? NaN) : null;
  const periodSmallestPct = periodSmallest != null ? Number(tradeHistory.find(t => Number(t.PeriodGain) === periodSmallest)?.PeriodGainPct ?? NaN) : null;

  const totalAvg = avg(totalGainValues);
  const totalLargest = largest(totalGainValues);
  const totalSmallest = smallest(totalGainValues);
  const totalLargestPct = totalLargest != null ? Number(tradeHistory.find(t => Number(t.TotalGain) === totalLargest)?.TotalGainPct ?? NaN) : null;
  const totalSmallestPct = totalSmallest != null ? Number(tradeHistory.find(t => Number(t.TotalGain) === totalSmallest)?.TotalGainPct ?? NaN) : null;

  const currentValueAvg = avg(currentValueValues);
  const currentValueLargest = largest(currentValueValues);

  const currentCostAvg = avg(currentCostValues);
  const currentCostLargest = largest(currentCostValues);

  // Compute total gain percentages using requested formula
  // Period pct = totalPeriodGain / (sum(CurrentValue for period) - totalPeriodGain)
  const periodValueValuesForPct = tradeHistory
    .filter(t => Number.isFinite(Number(t.PeriodGain)))
    .map(t => Number(t.CurrentValue))
    .filter(Number.isFinite);
  const totalPeriodValue = periodValueValuesForPct.reduce((sum, val) => sum + val, 0);
  const periodDenominator = totalPeriodValue - totalPeriodGain;
  const totalPeriodGainPct = periodDenominator !== 0 ? (totalPeriodGain / periodDenominator) : null;

  // Overall pct remains total TotalGain / sum(CurrentCost)
  const totalTotalGainPct = totalCurrentCost !== 0 ? (totalTotalGain / totalCurrentCost) : null;

  const periodAvgHtml = periodAvg != null ? `${formatCurrency(periodAvg)}${avgPeriodGainPct != null ? ' (' + formatPercent(avgPeriodGainPct) + ')' : ''}` : '—';
  const periodLargestHtml = periodLargest != null ? `${formatCurrency(periodLargest)}${Number.isFinite(periodLargestPct) ? ' (' + formatPercent(periodLargestPct as number) + ')' : ''}` : '—';
  const periodSmallestHtml = periodSmallest != null ? `${formatCurrency(periodSmallest)}${Number.isFinite(periodSmallestPct) ? ' (' + formatPercent(periodSmallestPct as number) + ')' : ''}` : '—';

  const totalAvgHtml = totalAvg != null ? `${formatCurrency(totalAvg)}${avgTotalGainPct != null ? ' (' + formatPercent(avgTotalGainPct) + ')' : ''}` : '—';
  const totalLargestHtml = totalLargest != null ? `${formatCurrency(totalLargest)}${Number.isFinite(totalLargestPct) ? ' (' + formatPercent(totalLargestPct as number) + ')' : ''}` : '—';
  const totalSmallestHtml = totalSmallest != null ? `${formatCurrency(totalSmallest)}${Number.isFinite(totalSmallestPct) ? ' (' + formatPercent(totalSmallestPct as number) + ')' : ''}` : '—';

  const currentValueAvgHtml = currentValueAvg != null ? formatCurrency(currentValueAvg) : '—';
  const currentValueLargestHtml = currentValueLargest != null ? formatCurrency(currentValueLargest) : '—';

  const currentCostAvgHtml = currentCostAvg != null ? formatCurrency(currentCostAvg) : '—';
  const currentCostLargestHtml = currentCostLargest != null ? formatCurrency(currentCostLargest) : '—';

  // Prepare centered stat lines and conditionally show Largest Win / Largest Loss
  const periodAvgLine = `<div>Gain Pct: ${totalPeriodGainPct != null ? formatPercent(totalPeriodGainPct) : '—'}</div>`;
  const periodLargestLine = (periodLargest != null && periodLargest > 0) ? `<div>Largest Win: ${periodLargestHtml}</div>` : '';
  const periodSmallestLine = (periodSmallest != null && periodSmallest < 0) ? `<div>Largest Loss: ${periodSmallestHtml}</div>` : '';

  const totalAvgLine = `<div>Gain Pct: ${totalTotalGainPct != null ? formatPercent(totalTotalGainPct) : '—'}</div>`;
  const totalLargestLine = (totalLargest != null && totalLargest > 0) ? `<div>Largest Win: ${totalLargestHtml}</div>` : '';
  const totalSmallestLine = (totalSmallest != null && totalSmallest < 0) ? `<div>Largest Loss: ${totalSmallestHtml}</div>` : '';

  const currentValueAvgLine = `<div>Average: ${currentValueAvgHtml}</div>`;
  const currentValueLargestLine = (currentValueLargest != null && currentValueLargest > 0) ? `<div>Largest: ${currentValueLargestHtml}</div>` : '';

  const currentCostAvgLine = `<div>Average: ${currentCostAvgHtml}</div>`;
  const currentCostLargestLine = (currentCostLargest != null && currentCostLargest > 0) ? `<div>Largest: ${currentCostLargestHtml}</div>` : '';

  statsContent.innerHTML = `
    <div class="col-md-3">
      <div class="card border-0 shadow-sm h-100 stats-card ${periodCardStateClass ? `stats-card-${periodCardStateClass}` : ''}">
        <div class="card-body text-center">
          <div class="stats-icon mb-2">📈</div>
          <h6 class="card-subtitle mb-2 text-muted text-uppercase small">${periodLabel} Gain</h6>
          <h3 class="card-title mb-1 fw-bold ${periodPctClass}">${periodGainValues.length > 0 ? formatCurrency(totalPeriodGain) : '—'}</h3>
          <div class="small text-muted text-center mt-2">
            ${periodAvgLine}
            ${periodLargestLine}
            ${periodSmallestLine}
          </div>
        </div>
      </div>
    </div>
    <div class="col-md-3">
      <div class="card border-0 shadow-sm h-100 stats-card stats-card-${totalGainPositive ? 'success' : (totalGainNegative ? 'danger' : '')}">
        <div class="card-body text-center">
          <div class="stats-icon mb-2">${totalGainPositive ? '💰' : '📉'}</div>
          <h6 class="card-subtitle mb-2 text-muted text-uppercase small">Total Gain</h6>
          <h3 class="card-title mb-1 fw-bold ${totalPctClass}">${totalGainValues.length > 0 ? formatCurrency(totalTotalGain) : '—'}</h3>
          <div class="small text-muted text-center mt-2">
            ${totalAvgLine}
            ${totalLargestLine}
            ${totalSmallestLine}
          </div>
        </div>
      </div>
    </div>
    <div class="col-md-3">
      <div class="card border-0 shadow-sm h-100 stats-card">
        <div class="card-body text-center">
          <div class="stats-icon mb-2">💲</div>
          <h6 class="card-subtitle mb-2 text-muted text-uppercase small">Current Value</h6>
          <h3 class="card-title mb-1 fw-bold">${currentValueValues.length > 0 ? formatCurrency(totalCurrentValue) : '—'}</h3>
          <div class="small text-muted text-center mt-2">
            ${currentValueAvgLine}
            ${currentValueLargestLine}
          </div>
        </div>
      </div>
    </div>
    <div class="col-md-3">
      <div class="card border-0 shadow-sm h-100 stats-card">
        <div class="card-body text-center">
          <div class="stats-icon mb-2">🎲</div>
          <h6 class="card-subtitle mb-2 text-muted text-uppercase small">Current Cost</h6>
          <h3 class="card-title mb-1 fw-bold">${currentCostValues.length > 0 ? formatCurrency(totalCurrentCost) : '—'}</h3>
          <div class="small text-muted text-center mt-2">
            ${currentCostAvgLine}
            ${currentCostLargestLine}
          </div>
        </div>
      </div>
    </div>
  `;
  
  statsWrapper.appendChild(statsContent);
  container.appendChild(statsWrapper);
};

const formatDateRange = (periodStart: string, periodEnd: string, rollupPeriod: RollupPeriod): string => {
  const start = new Date(periodStart + 'T12:00:00Z');
  const end = new Date(periodEnd + 'T12:00:00Z');
  
  const dateOptions: Intl.DateTimeFormatOptions = { 
    timeZone: 'America/New_York',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  };
  
  switch (rollupPeriod) {
    case 1: // Daily
      return end.toLocaleDateString('en-US', dateOptions);
    case 2: // Weekly
      return `${start.toLocaleDateString('en-US', dateOptions)} - ${end.toLocaleDateString('en-US', dateOptions)}`;
    case 3: // Monthly
      return end.toLocaleDateString('en-US', { timeZone: 'America/New_York', year: 'numeric', month: 'long' });
    default:
      return end.toLocaleDateString('en-US', dateOptions);
  }
};

const renderChart = (container: HTMLElement, tradeHistory: TradeHistoryRow[], chartType: ChartType) => {
  if (!Highcharts) {
    console.warn('[tradeHistoryClient] Highcharts not available');
    return;
  }

  if (chartType === 'periodGain') {
    // Period Gain: aggregate PeriodGain per period with realized/unrealized stacking
    const gainColors = {
      realized: { positive: '#00c853', negative: '#ff4d4f' },
      unrealized: '#d9c38a',
      total: { positive: '#00c853', negative: '#ff4d4f' }
    };

    const formatPeriodLabel = (periodEnd: string, rollupPeriod: RollupPeriod): string => {
      const date = new Date(periodEnd + 'T12:00:00');
      
      switch (rollupPeriod) {
        case 3: // Monthly
          return date.toLocaleDateString('en-US', { timeZone: 'America/New_York', year: 'numeric', month: 'long' });
        case 2: // Weekly
          return 'Week of ' + date.toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric' });
        case 1: // Daily
        default:
          return date.toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric' });
      }
    };
    
    // Aggregate PeriodGain by period with account names and realized/unrealized
    const periodGainMap = new Map<string, { periodLabel: string; periodEnd: string; totalGain: number; realizedGain: number; unrealizedGain: number; accountNames: Set<string> }>();
    
    tradeHistory.forEach(row => {
      const periodGain = typeof row.PeriodGain === 'string' ? parseFloat(row.PeriodGain) : row.PeriodGain;
      const realizedRaw = row.RealizedGainAtPeriodEnd;
      const unrealizedRaw = row.UnrealizedGainAtPeriodEnd;
      const realized = typeof realizedRaw === 'string' ? parseFloat(realizedRaw) : realizedRaw;
      const unrealized = typeof unrealizedRaw === 'string' ? parseFloat(unrealizedRaw) : unrealizedRaw;
      
      if (periodGain === null || periodGain === undefined || isNaN(periodGain)) {
        return;
      }
      
      const periodLabel = formatPeriodLabel(row.PeriodEnd, currentRollupPeriod);
      
      if (!periodGainMap.has(periodLabel)) {
        periodGainMap.set(periodLabel, {
          periodLabel,
          periodEnd: row.PeriodEnd,
          totalGain: 0,
          realizedGain: 0,
          unrealizedGain: 0,
          accountNames: new Set()
        });
      }
      
      const entry = periodGainMap.get(periodLabel)!;
      entry.totalGain += periodGain;
      if (realized !== null && !isNaN(realized)) entry.realizedGain += realized;
      if (unrealized !== null && !isNaN(unrealized)) entry.unrealizedGain += unrealized;
      entry.accountNames.add(row.AccountName);
    });
    
    if (periodGainMap.size === 0) {
      container.innerHTML = `
        <div class="d-flex align-items-center justify-content-center" style="min-height: 400px;">
          <div class="text-center text-muted">
            <i class="fa-solid fa-chart-line fa-3x mb-3 opacity-25"></i>
            <p class="fs-5 mb-1">No trades to display</p>
            <p class="small">Try adjusting your filters or date range</p>
          </div>
        </div>
      `;
      return;
    }
    
    // Sort by period end date
    const sortedData = Array.from(periodGainMap.values()).sort((a, b) => 
      a.periodEnd.localeCompare(b.periodEnd)
    );
    
    // Prepare stacked chart data
    const categories = sortedData.map(d => d.periodLabel);
    const realizedPosData: any[] = [];
    const realizedNegData: any[] = [];
    const unrealizedPosData: any[] = [];
    const unrealizedNegData: any[] = [];
    const totalData: any[] = [];
    const realizedValues: Array<number> = [];
    const unrealizedValues: Array<number> = [];
    const accountNamesArray: Array<string[]> = [];

    sortedData.forEach(d => {
      const realized = d.realizedGain;
      const unrealized = d.unrealizedGain;
      const hasSplit = realized !== 0 && unrealized !== 0;

      realizedValues.push(realized);
      unrealizedValues.push(unrealized);
      accountNamesArray.push(Array.from(d.accountNames).sort());

      if (hasSplit) {
        if (realized >= 0) {
          realizedPosData.push({ y: realized, color: gainColors.realized.positive, sectionLabel: 'Realized Gain' });
          realizedNegData.push({ y: null });
        } else {
          realizedPosData.push({ y: null });
          realizedNegData.push({ y: realized, color: gainColors.realized.negative, sectionLabel: 'Realized Gain' });
        }

        if (unrealized >= 0) {
          unrealizedPosData.push({ y: unrealized, color: gainColors.unrealized, sectionLabel: 'Unrealized Gain' });
          unrealizedNegData.push({ y: null });
        } else {
          unrealizedPosData.push({ y: null });
          unrealizedNegData.push({ y: unrealized, color: gainColors.unrealized, sectionLabel: 'Unrealized Gain' });
        }

        totalData.push({ y: null });
      } else {
        realizedPosData.push({ y: null });
        realizedNegData.push({ y: null });
        unrealizedPosData.push({ y: null });
        unrealizedNegData.push({ y: null });
        totalData.push({
          y: d.totalGain,
          color: d.totalGain >= 0 ? gainColors.total.positive : gainColors.total.negative,
          sectionLabel: 'Period Gain'
        });
      }
    });

    const series: any[] = [];
    const hasRealizedPos = realizedPosData.some(point => point.y !== null && point.y !== undefined);
    const hasUnrealizedPos = unrealizedPosData.some(point => point.y !== null && point.y !== undefined);
    const hasRealizedNeg = realizedNegData.some(point => point.y !== null && point.y !== undefined);
    const hasUnrealizedNeg = unrealizedNegData.some(point => point.y !== null && point.y !== undefined);
    const hasTotal = totalData.some(point => point.y !== null && point.y !== undefined);

    if (hasRealizedPos) {
      series.push({
        name: 'Realized Gain',
        data: realizedPosData,
        color: gainColors.realized.positive
      });
    }

    if (hasUnrealizedPos) {
      series.push({
        name: 'Unrealized Gain',
        data: unrealizedPosData,
        color: gainColors.unrealized
      });
    }

    if (hasRealizedNeg) {
      series.push({
        name: 'Realized Gain',
        data: realizedNegData,
        linkedTo: ':previous',
        showInLegend: false
      });
    }

    if (hasUnrealizedNeg) {
      series.push({
        name: 'Unrealized Gain',
        data: unrealizedNegData,
        linkedTo: ':previous',
        showInLegend: false
      });
    }

    if (hasTotal) {
      series.push({
        name: 'Period Gain',
        data: totalData,
        color: gainColors.total.positive
      });
    }
    
    const rollupTitles: Record<RollupPeriod, string> = {
      1: 'Daily Gain History',
      2: 'Weekly Gain History',
      3: 'Monthly Gain History'
    };
    
    const chartOptions: any = {
      chart: {
        type: 'column',
        backgroundColor: 'transparent'
      },
      title: {
        text: rollupTitles[currentRollupPeriod],
        align: 'left',
        style: {
          fontSize: '1.25rem',
          fontWeight: '600',
          color: '#e8e8e8'
        }
      },
      xAxis: {
        categories: categories,
        title: { text: 'Period' },
        gridLineColor: 'rgba(255,255,255,0.06)',
        gridLineWidth: 1,
        labels: {
          rotation: -45,
          style: {
            fontSize: '11px',
            color: '#c8c8c8'
          }
        }
      },
      yAxis: {
        title: { text: 'Period Gain' },
        reversedStacks: false,
        gridLineColor: 'rgba(255,255,255,0.06)',
        gridLineWidth: 1,
        labels: {
          style: { color: '#c8c8c8' },
          formatter: function(this: any): string {
            return '$' + Highcharts.numberFormat(this.value, 0, '.', ',');
          }
        },
        plotLines: [{
          value: 0,
          color: '#999',
          width: 1,
          zIndex: 4
        }]
      },
      tooltip: {
        useHTML: true,
        shared: false,
        formatter: function(this: any): string {
          const pointIndex = this.point ? this.point.index : 0;
          const period = categories[pointIndex] || '';
          const accountNames = accountNamesArray[pointIndex] || [];
          const seriesName = this.point && this.point.sectionLabel ? this.point.sectionLabel : (this.series && this.series.name ? this.series.name : '');

          const realizedVal = realizedValues[pointIndex] ?? 0;
          const unrealizedVal = unrealizedValues[pointIndex] ?? 0;
          const computedTotal = realizedVal + unrealizedVal;

          let html = '<table>' +
            '<tr><th>Period:</th><td>' + period + '</td></tr>';
          if (accountNames.length > 0) {
            html += '<tr><th>Account:</th><td>' + accountNames.join(', ') + '</td></tr>';
          }

          const isTotalOnly = seriesName === 'Period Gain' && (realizedVal === 0 && unrealizedVal === 0);
          if (!isTotalOnly && seriesName) {
            html += '<tr><th>' + seriesName + ':</th><td style="text-align: right">' + '$' + Highcharts.numberFormat(this.y, 2, '.', ',') + '</td></tr>';
          }
          if (computedTotal !== 0) {
            const totalLabel = isTotalOnly ? 'Period Gain' : 'Total';
            html += '<tr><th>' + totalLabel + ':</th><td style="text-align: right">' + '$' + Highcharts.numberFormat(computedTotal, 2, '.', ',') + '</td></tr>';
          }
          html += '</table>';
          return html;
        }
      },
      legend: {
        enabled: true,
        layout: 'horizontal',
        align: 'center',
        verticalAlign: 'bottom',
        itemStyle: { color: '#c8c8c8' },
        itemHoverStyle: { color: '#ffffff' }
      },
      plotOptions: {
        column: {
          stacking: 'normal',
          pointPadding: 0.1,
          borderWidth: 0,
          dataLabels: {
            enabled: false
          }
        }
      },
      series: series,
      credits: {
        enabled: false
      }
    };
    
    if (tradeHistoryChart) {
      try { tradeHistoryChart.destroy(); } catch (err) { }
    }
    tradeHistoryChart = Highcharts.chart(container, chartOptions);
    return;
  }
  
  if (chartType === 'periodSymbolGain') {
    // Period Symbol Gain: aggregate PeriodGain by symbol for current period with realized/unrealized stacking
    const gainColors = {
      realized: { positive: '#00c853', negative: '#ff4d4f' },
      unrealized: '#d9c38a',
      total: { positive: '#00c853', negative: '#ff4d4f' }
    };

    const symbolGainMap = new Map<string, { symbol: string; totalGain: number; realizedGain: number; unrealizedGain: number; accountNames: Set<string> }>();
    
    tradeHistory.forEach(row => {
      const periodGain = typeof row.PeriodGain === 'string' ? parseFloat(row.PeriodGain) : row.PeriodGain;
      const realizedRaw = row.RealizedGainAtPeriodEnd;
      const unrealizedRaw = row.UnrealizedGainAtPeriodEnd;
      const realized = typeof realizedRaw === 'string' ? parseFloat(realizedRaw) : realizedRaw;
      const unrealized = typeof unrealizedRaw === 'string' ? parseFloat(unrealizedRaw) : unrealizedRaw;
      
      if (periodGain === null || periodGain === undefined || isNaN(periodGain)) {
        return;
      }
      
      const symbol = row.Symbol;
      
      if (!symbolGainMap.has(symbol)) {
        symbolGainMap.set(symbol, {
          symbol,
          totalGain: 0,
          realizedGain: 0,
          unrealizedGain: 0,
          accountNames: new Set()
        });
      }
      
      const entry = symbolGainMap.get(symbol)!;
      entry.totalGain += periodGain;
      if (realized !== null && !isNaN(realized)) entry.realizedGain += realized;
      if (unrealized !== null && !isNaN(unrealized)) entry.unrealizedGain += unrealized;
      entry.accountNames.add(row.AccountName);
    });
    
    if (symbolGainMap.size === 0) {
      container.innerHTML = `
        <div class="d-flex align-items-center justify-content-center" style="min-height: 400px;">
          <div class="text-center text-muted">
            <i class="fa-solid fa-chart-line fa-3x mb-3 opacity-25"></i>
            <p class="fs-5 mb-1">No trades to display</p>
            <p class="small">Try adjusting your filters</p>
          </div>
        </div>
      `;
      return;
    }
    
    // Sort using the table's sort order
    const sortedData = Array.from(symbolGainMap.values()).sort((a, b) => {
      const sortKey = currentSortState.key;
      const sortDir = currentSortState.direction === 'asc' ? 1 : -1;
      
      // Map sort keys to our aggregated data
      if (sortKey === 'Symbol') {
        return a.symbol.localeCompare(b.symbol) * sortDir;
      } else if (sortKey === 'PeriodGain') {
        return (a.totalGain - b.totalGain) * sortDir;
      }
      // Default to symbol name for other sort keys
      return a.symbol.localeCompare(b.symbol);
    });
    
    // Prepare stacked chart data
    const categories = sortedData.map(d => d.symbol);
    const realizedPosData: any[] = [];
    const realizedNegData: any[] = [];
    const unrealizedPosData: any[] = [];
    const unrealizedNegData: any[] = [];
    const totalData: any[] = [];
    const realizedValues: Array<number> = [];
    const unrealizedValues: Array<number> = [];
    const accountNamesArray: Array<string[]> = [];

    sortedData.forEach(d => {
      const realized = d.realizedGain;
      const unrealized = d.unrealizedGain;
      const hasSplit = realized !== 0 && unrealized !== 0;

      realizedValues.push(realized);
      unrealizedValues.push(unrealized);
      accountNamesArray.push(Array.from(d.accountNames).sort());

      if (hasSplit) {
        if (realized >= 0) {
          realizedPosData.push({ y: realized, color: gainColors.realized.positive, sectionLabel: 'Realized Gain' });
          realizedNegData.push({ y: null });
        } else {
          realizedPosData.push({ y: null });
          realizedNegData.push({ y: realized, color: gainColors.realized.negative, sectionLabel: 'Realized Gain' });
        }

        if (unrealized >= 0) {
          unrealizedPosData.push({ y: unrealized, color: gainColors.unrealized, sectionLabel: 'Unrealized Gain' });
          unrealizedNegData.push({ y: null });
        } else {
          unrealizedPosData.push({ y: null });
          unrealizedNegData.push({ y: unrealized, color: gainColors.unrealized, sectionLabel: 'Unrealized Gain' });
        }

        totalData.push({ y: null });
      } else {
        realizedPosData.push({ y: null });
        realizedNegData.push({ y: null });
        unrealizedPosData.push({ y: null });
        unrealizedNegData.push({ y: null });
        totalData.push({
          y: d.totalGain,
          color: d.totalGain >= 0 ? gainColors.total.positive : gainColors.total.negative,
          sectionLabel: 'Period Gain'
        });
      }
    });

    const series: any[] = [];
    const hasRealizedPos = realizedPosData.some(point => point.y !== null && point.y !== undefined);
    const hasUnrealizedPos = unrealizedPosData.some(point => point.y !== null && point.y !== undefined);
    const hasRealizedNeg = realizedNegData.some(point => point.y !== null && point.y !== undefined);
    const hasUnrealizedNeg = unrealizedNegData.some(point => point.y !== null && point.y !== undefined);
    const hasTotal = totalData.some(point => point.y !== null && point.y !== undefined);

    if (hasRealizedPos) {
      series.push({
        name: 'Realized Gain',
        data: realizedPosData,
        color: gainColors.realized.positive
      });
    }

    if (hasUnrealizedPos) {
      series.push({
        name: 'Unrealized Gain',
        data: unrealizedPosData,
        color: gainColors.unrealized
      });
    }

    if (hasRealizedNeg) {
      series.push({
        name: 'Realized Gain',
        data: realizedNegData,
        linkedTo: ':previous',
        showInLegend: false
      });
    }

    if (hasUnrealizedNeg) {
      series.push({
        name: 'Unrealized Gain',
        data: unrealizedNegData,
        linkedTo: ':previous',
        showInLegend: false
      });
    }

    if (hasTotal) {
      series.push({
        name: 'Period Gain',
        data: totalData,
        color: gainColors.total.positive
      });
    }
    
    const rollupSymbolTitles: Record<RollupPeriod, string> = {
      1: 'Daily Trade Gains',
      2: 'Weekly Trade Gains',
      3: 'Monthly Trade Gains'
    };
    
    const chartOptions: any = {
      chart: {
        type: 'column',
        backgroundColor: 'transparent'
      },
      title: {
        text: rollupSymbolTitles[currentRollupPeriod],
        align: 'left',
        style: {
          fontSize: '1.25rem',
          fontWeight: '600',
          color: '#e8e8e8'
        }
      },
      xAxis: {
        categories: categories,
        title: { text: 'Symbol' },
        gridLineColor: 'rgba(255,255,255,0.06)',
        gridLineWidth: 1,
        labels: {
          rotation: -45,
          style: {
            fontSize: '11px',
            color: '#c8c8c8'
          }
        }
      },
      yAxis: {
        title: { text: 'Period Gain' },
        reversedStacks: false,
        gridLineColor: 'rgba(255,255,255,0.06)',
        gridLineWidth: 1,
        labels: {
          style: { color: '#c8c8c8' },
          formatter: function(this: any): string {
            return '$' + Highcharts.numberFormat(this.value, 0, '.', ',');
          }
        },
        plotLines: [{
          value: 0,
          color: '#999',
          width: 1,
          zIndex: 4
        }]
      },
      tooltip: {
        useHTML: true,
        shared: false,
        formatter: function(this: any): string {
          const pointIndex = this.point ? this.point.index : 0;
          const symbol = categories[pointIndex] || '';
          const accountNames = accountNamesArray[pointIndex] || [];
          const seriesName = this.point && this.point.sectionLabel ? this.point.sectionLabel : (this.series && this.series.name ? this.series.name : '');

          const realizedVal = realizedValues[pointIndex] ?? 0;
          const unrealizedVal = unrealizedValues[pointIndex] ?? 0;
          const computedTotal = realizedVal + unrealizedVal;

          let html = '<table>' +
            '<tr><th colspan="2"><strong>' + symbol + '</strong></th></tr>';
          if (accountNames.length > 0) {
            html += '<tr><th>Accounts:</th><td>' + accountNames.join(', ') + '</td></tr>';
          }

          const isTotalOnly = seriesName === 'Period Gain' && (realizedVal === 0 && unrealizedVal === 0);
          if (!isTotalOnly && seriesName) {
            html += '<tr><th>' + seriesName + ':</th><td style="text-align: right">' + '$' + Highcharts.numberFormat(this.y, 2, '.', ',') + '</td></tr>';
          }
          if (computedTotal !== 0) {
            const totalLabel = isTotalOnly ? 'Period Gain' : 'Total';
            html += '<tr><th>' + totalLabel + ':</th><td style="text-align: right">' + '$' + Highcharts.numberFormat(computedTotal, 2, '.', ',') + '</td></tr>';
          }
          html += '</table>';
          return html;
        }
      },
      legend: {
        enabled: true,
        layout: 'horizontal',
        align: 'center',
        verticalAlign: 'bottom',
        itemStyle: { color: '#c8c8c8' },
        itemHoverStyle: { color: '#ffffff' }
      },
      plotOptions: {
        column: {
          stacking: 'normal',
          pointPadding: 0.1,
          borderWidth: 0,
          dataLabels: {
            enabled: false
          }
        }
      },
      series: series,
      credits: {
        enabled: false
      }
    };
    
    if (tradeHistoryChart) {
      try { tradeHistoryChart.destroy(); } catch (err) { }
    }
    tradeHistoryChart = Highcharts.chart(container, chartOptions);
    return;
  }
  
  // For trade-based charts (tradeValue, tradeGain, and stacked variants)
  if (chartType === 'tradeValue' || chartType === 'tradeValueStacked' || chartType === 'tradeGain' || chartType === 'tradeGainStacked') {
    const isStackedChart = chartType === 'tradeValueStacked' || chartType === 'tradeGainStacked';
    
    // Format period label based on rollup period
    const formatPeriodLabel = (periodEnd: string, rollupPeriod: RollupPeriod): string => {
      const date = new Date(periodEnd + 'T12:00:00');
      
      switch (rollupPeriod) {
        case 3: // Monthly
          return date.toLocaleDateString('en-US', { timeZone: 'America/New_York', year: 'numeric', month: 'long' });
        case 2: // Weekly
          return 'Week of ' + date.toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric' });
        case 1: // Daily
        default:
          return date.toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric' });
      }
    };
    
    // Group data by TradeID and period
    // When groupBy='symbolGroup', TradeID is null, so use Symbol+AccountID+PeriodEnd as key
    const tradeDataMap = new Map<string, Array<{ periodLabel: string; periodEnd: string; y: number; accountName: string }>>();
    const tradeSymbolMap = new Map<string, string>();
    const allPeriodLabels = new Set<string>();
    
    tradeHistory.forEach(row => {
      // Get the value based on chart type
      const isGainChart = chartType === 'tradeGain' || chartType === 'tradeGainStacked';
      const rawValue = isGainChart ? row.TotalGain : row.CurrentValue;
      const value = typeof rawValue === 'string' ? parseFloat(rawValue) : rawValue;
      
      // Exclude null/undefined values
      if (value === null || value === undefined || isNaN(value)) {
        return;
      }
      // For value charts only, exclude 0 or negative values
      if (!isGainChart && value <= 0) {
        return;
      }
      
      // Use composite key: when TradeID is null (symbolGroup mode), use Symbol+AccountID
      const tradeKey = row.TradeID !== null ? `trade-${row.TradeID}` : `group-${row.Symbol}-${row.AccountID}`;
      const periodLabel = formatPeriodLabel(row.PeriodEnd, currentRollupPeriod);
      
      if (!tradeDataMap.has(tradeKey)) {
        tradeDataMap.set(tradeKey, []);
        tradeSymbolMap.set(tradeKey, row.Symbol);
      }
      
      tradeDataMap.get(tradeKey)!.push({
        periodLabel,
        periodEnd: row.PeriodEnd,
        y: value,
        accountName: row.AccountName
      });
      
      allPeriodLabels.add(periodLabel);
    });
    
    // Check if we have any valid data to chart
    if (tradeDataMap.size === 0) {
      container.innerHTML = `
        <div class="d-flex align-items-center justify-content-center" style="min-height: 400px;">
          <div class="text-center text-muted">
            <i class="fa-solid fa-chart-line fa-3x mb-3 opacity-25"></i>
            <p class="fs-5 mb-1">No trades to display</p>
            <p class="small">Try adjusting your filters or date range</p>
          </div>
        </div>
      `;
      return;
    }
    
    // Sort period labels chronologically
    const sortedPeriodLabels = Array.from(allPeriodLabels).sort((a, b) => {
      // Find any row with this label to get the actual date
      const aRow = tradeHistory.find(r => formatPeriodLabel(r.PeriodEnd, currentRollupPeriod) === a);
      const bRow = tradeHistory.find(r => formatPeriodLabel(r.PeriodEnd, currentRollupPeriod) === b);
      if (!aRow || !bRow) return 0;
      return aRow.PeriodEnd.localeCompare(bRow.PeriodEnd);
    });
    
    // Convert to Highcharts series format
    const series: any[] = [];
    const colors = [
      '#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd',
      '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf'
    ];
    let colorIndex = 0;
    
    tradeDataMap.forEach((data, tradeKey) => {
      // Sort by period date
      data.sort((a, b) => a.periodEnd.localeCompare(b.periodEnd));
      
      const symbol = tradeSymbolMap.get(tradeKey) || 'Unknown';
      const color = colors[colorIndex % colors.length];
      colorIndex++;
      
      // Map to category-value pairs with account names
      series.push({
        name: symbol,
        data: data.map(d => ({
          x: sortedPeriodLabels.indexOf(d.periodLabel),
          y: d.y,
          accountName: d.accountName
        })),
        color: color,
        marker: {
          enabled: true,
          radius: 4
        }
      });
    });
    
    const chartTitles: Record<ChartType, string> = {
      'tradeValue': 'Trade Value',
      'tradeValueStacked': 'Trade Value Stacked',
      'tradeGain': 'Trade Gain',
      'tradeGainStacked': 'Trade Gain Stacked',
      'periodGain': 'Period Gain History',
      'periodSymbolGain': 'Period Symbol Gains'
    };
    
    const chartOptions: any = {
      chart: {
        type: isStackedChart ? 'area' : 'line',
        backgroundColor: 'transparent',
        zoomType: 'x'
      },
      title: {
        text: chartTitles[chartType],
        align: 'left',
        style: {
          fontSize: '1.25rem',
          fontWeight: '600',
          color: '#e8e8e8'
        }
      },
      xAxis: {
        type: 'category',
        categories: sortedPeriodLabels,
        title: { text: 'Period' },
        gridLineColor: 'rgba(255,255,255,0.06)',
        gridLineWidth: 1,
        labels: {
          rotation: -45,
          style: {
            fontSize: '11px',
            color: '#c8c8c8'
          }
        }
      },
      yAxis: {
        title: { text: 'Current Value' },
        gridLineColor: 'rgba(255,255,255,0.06)',
        gridLineWidth: 1,
        labels: {
          style: { color: '#c8c8c8' },
          formatter: function(this: any): string {
            return '$' + Highcharts.numberFormat(this.value, 0, '.', ',');
          }
        }
      },
      tooltip: {
        useHTML: true,
        shared: false,
        formatter: function(this: any): string {
          const value = '$' + Highcharts.numberFormat(this.y, 2, '.', ',');
          const seriesName = this.series.name;
          const period = sortedPeriodLabels[this.point.x];
          const accountName = this.point.accountName || '';
          const isGainChart = chartType === 'tradeGain' || chartType === 'tradeGainStacked';
          const label = isGainChart ? 'Gain:' : 'Value:';
          const accountRow = accountName ? '<tr><th>Account:</th><td>' + accountName + '</td></tr>' : '';
          
          return '<table>' +
            '<tr><th colspan="2"><strong>' + seriesName + '</strong></th></tr>' +
            accountRow +
            '<tr><th>Period:</th><td>' + period + '</td></tr>' +
            '<tr><th>' + label + '</th><td style="text-align: right">' + value + '</td></tr>' +
            '</table>';
        }
      },
      legend: {
        enabled: true,
        layout: 'horizontal',
        align: 'center',
        verticalAlign: 'bottom',
        maxHeight: 80,
        navigation: {
          activeColor: '#e8e8e8',
          inactiveColor: '#666666',
          style: {
            color: '#e8e8e8'
          }
        },
        itemStyle: {
          color: '#e8e8e8'
        }
      },
      plotOptions: {
        line: {
          dataLabels: {
            enabled: false
          }
        },
        area: {
          stacking: 'normal',
          lineColor: '#999999',
          lineWidth: 1,
          marker: {
            enabled: false,
            lineWidth: 1,
            lineColor: '#999999'
          },
          dataLabels: {
            enabled: false
          }
        }
      },
      series: series,
      credits: {
        enabled: false
      }
    };
    
    if (tradeHistoryChart) {
      try { tradeHistoryChart.destroy(); } catch (err) { }
    }
    tradeHistoryChart = Highcharts.chart(container, chartOptions);
  }
};

const renderToolbar = (
  container: HTMLElement,
  onReset: () => void,
  onPrevPeriod: () => void,
  onNextPeriod: () => void,
  onLatest: () => void,
  onRollupChange: (rollup: RollupPeriod) => void,
  onRefreshQuotes: () => void,
  onResyncBrokers: () => void,
  currentRollup: RollupPeriod,
  onViewModeChange: (mode: ViewMode) => void,
  currentMode: ViewMode,
  groupBy: 'symbol' | 'symbolGroup',
  onGroupByChange: (groupBy: 'symbol' | 'symbolGroup') => void,
  quotesAsOf: string | null,
  chartType: ChartType
) => {
  const toolbar = document.createElement('div');
  toolbar.className = 'btn-toolbar mb-3 flex-wrap flex-lg-nowrap gap-2 align-items-center';
  toolbar.setAttribute('role', 'toolbar');

  const leftGroup = document.createElement('div');
  leftGroup.className = 'btn-group';
  // Reset is handled by clicking the page title (consistent with Accounts page)

  const navGroup = document.createElement('div');
  // No left margin here so buttons are flush to the left edge
  navGroup.className = 'btn-group';
  
  // Hide navigation in chart mode except for periodSymbolGain
  if (currentMode === 'chart' && currentChartType !== 'periodSymbolGain') {
    navGroup.style.display = 'none';
  }

  const prevBtn = document.createElement('button');
  prevBtn.type = 'button';
  prevBtn.id = 'tradeHistory-prev-btn';
  prevBtn.className = 'btn btn-sm btn-outline-secondary';
  prevBtn.innerHTML = '<i class="fa-solid fa-backward" aria-hidden="true"></i><span class="visually-hidden">Previous</span>';
  prevBtn.addEventListener('click', onPrevPeriod);

  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.id = 'tradeHistory-next-btn';
  nextBtn.className = 'btn btn-sm btn-outline-secondary';
  nextBtn.innerHTML = '<i class="fa-solid fa-forward" aria-hidden="true"></i><span class="visually-hidden">Next</span>';
  nextBtn.addEventListener('click', onNextPeriod);

  const latestBtn = document.createElement('button');
  latestBtn.type = 'button';
  latestBtn.id = 'tradeHistory-latest-btn';
  latestBtn.className = 'btn btn-sm btn-outline-secondary';
  latestBtn.innerHTML = '<i class="fa-solid fa-forward-fast" aria-hidden="true"></i><span class="visually-hidden">Latest</span>';
  latestBtn.addEventListener('click', onLatest);

  navGroup.appendChild(prevBtn);
  navGroup.appendChild(nextBtn);
  navGroup.appendChild(latestBtn);

  // Place navigation inside the left group so toolbar is flush to the left
  leftGroup.appendChild(navGroup);

  // Group By dropdown
  const groupByGroup = document.createElement('div');
  groupByGroup.className = (currentMode === 'chart' && currentChartType !== 'periodSymbolGain') ? 'btn-group' : 'btn-group ms-2';
  groupByGroup.setAttribute('role', 'group');

  const groupBySelect = document.createElement('select');
  groupBySelect.id = 'tradeHistory-group-by-select';
  groupBySelect.className = 'form-select form-select-sm';
  groupBySelect.style.width = 'auto';
  groupBySelect.style.minWidth = '180px';

  const symbolOption = document.createElement('option');
  symbolOption.value = 'symbol';
  symbolOption.textContent = 'Group by Symbols';
  if (groupBy === 'symbol') symbolOption.selected = true;

  const symbolGroupOption = document.createElement('option');
  symbolGroupOption.value = 'symbolGroup';
  symbolGroupOption.textContent = 'Group by Symbol Groups';
  if (groupBy === 'symbolGroup') symbolGroupOption.selected = true;

  groupBySelect.appendChild(symbolOption);
  groupBySelect.appendChild(symbolGroupOption);
  groupBySelect.addEventListener('change', () => {
    onGroupByChange(groupBySelect.value as 'symbol' | 'symbolGroup');
  });

  groupByGroup.appendChild(groupBySelect);
  leftGroup.appendChild(groupByGroup);

  const rollupGroup = document.createElement('div');
  // In chart mode, remove left margin since navGroup is hidden (except for periodSymbolGain)
  rollupGroup.className = (currentMode === 'chart' && currentChartType !== 'periodSymbolGain') ? 'btn-group' : 'btn-group ms-2';

  // No period label; show rollup buttons directly (matches Accounts page)

  const rollupOptions: Array<{ value: RollupPeriod; label: string }> = [
    { value: 1, label: 'Daily' },
    { value: 2, label: 'Weekly' },
    { value: 3, label: 'Monthly' }
  ];

  rollupOptions.forEach(opt => {
    const btn = document.createElement('button');
    btn.type = 'button';
    // Use outline-secondary and toggle the 'active' class when selected (matches Accounts page)
    btn.className = `btn btn-sm btn-outline-secondary ${currentRollup === opt.value ? 'active' : ''}`;
    btn.textContent = opt.label;
    btn.addEventListener('click', () => onRollupChange(opt.value));
    rollupGroup.appendChild(btn);
  });

  // Add Table/Chart toggle group
  const viewModeGroup = document.createElement('div');
  viewModeGroup.className = 'btn-group ms-2';
  
  const tableBtn = document.createElement('button');
  tableBtn.type = 'button';
  tableBtn.id = 'tradeHistory-view-table-btn';
  tableBtn.className = `btn btn-sm btn-outline-secondary ${currentMode === 'table' ? 'active' : ''}`;
  tableBtn.textContent = 'Table';
  tableBtn.addEventListener('click', () => onViewModeChange('table'));
  
  const chartBtn = document.createElement('button');
  chartBtn.type = 'button';
  chartBtn.id = 'tradeHistory-view-chart-btn';
  chartBtn.className = `btn btn-sm btn-outline-secondary ${currentMode === 'chart' ? 'active' : ''}`;
  chartBtn.textContent = 'Chart';
  chartBtn.addEventListener('click', () => onViewModeChange('chart'));
  
  viewModeGroup.appendChild(tableBtn);
  viewModeGroup.appendChild(chartBtn);

  const resyncGroup = document.createElement('div');
  resyncGroup.className = 'btn-group ms-2';
  
  const refreshBtn = document.createElement('button');
  refreshBtn.type = 'button';
  refreshBtn.className = 'btn btn-sm btn-outline-secondary';
  refreshBtn.innerHTML = '<i class="fa-solid fa-arrow-rotate-right" aria-hidden="true"></i> Quotes';
  refreshBtn.title = 'Refresh Quotes';
  refreshBtn.addEventListener('click', onRefreshQuotes);

  const resyncBtn = document.createElement('button');
  resyncBtn.type = 'button';
  resyncBtn.className = 'btn btn-sm btn-outline-secondary';
  resyncBtn.innerHTML = '<i class="fa-solid fa-arrow-rotate-right" aria-hidden="true"></i> Orders';
  resyncBtn.title = 'Resync Orders';
  resyncBtn.addEventListener('click', onResyncBrokers);
  
  // Place rollup, view mode, and resync group (with Quotes + Orders) inside leftGroup to keep controls flush left
  leftGroup.appendChild(rollupGroup);
  leftGroup.appendChild(viewModeGroup);
  resyncGroup.appendChild(refreshBtn);
  resyncGroup.appendChild(resyncBtn);
  leftGroup.appendChild(resyncGroup);

  toolbar.appendChild(leftGroup);

  // Navigation links group (Accounts / History / Trades / Performance / Orders)
  const navLinksGroup = document.createElement('div');
  navLinksGroup.className = 'btn-group ms-auto';
  navLinksGroup.setAttribute('role', 'group');

  const buildNavUrl = (basePath: string): string => {
    const params = new URLSearchParams();
    if (currentBrokerId) params.set('brokerId', String(currentBrokerId));
    if (currentAccountID) params.set('accountId', String(currentAccountID));
    if (currentSymbol) params.set('symbol', currentSymbol);
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
  navPerfBtn.className = 'btn btn-sm btn-outline-secondary active';
  navPerfBtn.disabled = true;
  navPerfBtn.textContent = 'History';
  navPerfBtn.title = 'View the profit and loss of your trades over time.';
  navPerfBtn.addEventListener('click', () => { window.location.href = buildNavUrl('/tradeHistory'); });

  // Show the adjacent account history button as 'Performance' while keeping its link the same

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
  navOrdersBtn.className = 'btn btn-sm btn-outline-secondary';
  navOrdersBtn.textContent = 'Orders';
  navOrdersBtn.title = 'View historical orders from the broker.';
  navOrdersBtn.addEventListener('click', () => { window.location.href = buildNavUrl('/orders'); });

  navLinksGroup.appendChild(navAccountsBtn);
  navLinksGroup.appendChild(navHistoryBtn);
  navLinksGroup.appendChild(navTradesBtn);
  navLinksGroup.appendChild(navPerfBtn);
  navLinksGroup.appendChild(navOrdersBtn);
  toolbar.appendChild(navLinksGroup);

  container.appendChild(toolbar);
};



const renderTradeHistoryTable = (
  mountPoint: HTMLElement,
  tradeHistory: TradeHistoryRow[],
  asOf: string,
  periodStart: string,
  periodEnd: string,
  isLatestPeriod: boolean,
  rollupPeriod: RollupPeriod,
  sortState: SortState,
  onSort: (key: ColumnKey) => void,
  onReset: () => void,
  onPrevPeriod: () => void,
  onNextPeriod: () => void,
  onLatest: () => void,
  onRollupChange: (rollup: RollupPeriod) => void,
  onRefreshQuotes: () => void,
  onResyncBrokers: () => void,
  onViewModeChange: (mode: ViewMode) => void,
  viewMode: ViewMode,
  chartType: ChartType,
  groupBy: 'symbol' | 'symbolGroup',
  onGroupByChange: (groupBy: 'symbol' | 'symbolGroup') => void,
  quotesAsOf: string | null
) => {
  const wrapper = document.createElement('div');
  
  // Date display with right-aligned trade count (show in table mode or when periodSymbolGain chart is selected)
  if (viewMode === 'table' || (viewMode === 'chart' && chartType === 'periodSymbolGain')) {
    const dateDisplay = document.createElement('div');
    const dateRangeText = formatDateRange(periodStart, periodEnd, rollupPeriod);
    const latestClass = isLatestPeriod ? 'bg-success text-white' : 'bg-light text-dark';
    // Use flex to place the date on the left and the trade count on the right
    dateDisplay.className = `mb-3 d-flex justify-content-between align-items-center ${latestClass} rounded px-3 py-2`;
    const latestBadge = isLatestPeriod ? ' <span class="badge bg-light text-success ms-2">LATEST</span>' : '';
    const leftHtml = `<div class="text-start"><strong>${dateRangeText}</strong>${latestBadge}</div>`;
    const tradeCount = tradeHistory ? tradeHistory.length : 0;
    const rightClass = isLatestPeriod ? 'text-end text-white small' : 'text-end text-muted small';
    const rightHtml = `<div class="${rightClass}">${tradeCount} ${tradeCount === 1 ? 'trade' : 'trades'}</div>`;
    dateDisplay.innerHTML = leftHtml + rightHtml;
    wrapper.appendChild(dateDisplay);
  }
  
  // Stats section (pass rollupPeriod so labels can be period-aware) - only show when in table mode
  if (viewMode === 'table') {
    renderStatsSection(wrapper, tradeHistory, asOf, rollupPeriod);
  }
  
  // Chart container and controls (only show in chart mode)
  if (viewMode === 'chart') {
    const chartControlsContainer = document.createElement('div');
    chartControlsContainer.className = 'd-flex justify-content-between align-items-center mb-2';
    
    // Left side: empty for now
    const leftSide = document.createElement('div');
    
    // Right side: date range and chart type dropdowns
    const rightSide = document.createElement('div');
    rightSide.className = 'd-flex align-items-center gap-2';
    
    // Date range dropdown container
    const dateRangeContainer = document.createElement('div');
    dateRangeContainer.className = 'dropdown';
    dateRangeContainer.id = 'tradeHistory-date-range-dropdown';
    // Hide for periodSymbolGain chart
    if (chartType === 'periodSymbolGain') {
      dateRangeContainer.style.display = 'none';
    }
    
    const dateRangeButton = document.createElement('button');
    dateRangeButton.className = 'btn btn-sm btn-outline-secondary dropdown-toggle d-flex align-items-center justify-content-between';
    dateRangeButton.type = 'button';
    dateRangeButton.setAttribute('data-bs-toggle', 'dropdown');
    dateRangeButton.setAttribute('aria-expanded', 'false');
    dateRangeButton.style.minWidth = '180px';
    dateRangeButton.style.color = '#e8e8e8';
    
    const dateRangeLabel = document.createElement('span');
    dateRangeLabel.className = 'text-truncate me-2';
    dateRangeLabel.id = 'tradeHistory-date-range-label';
    dateRangeLabel.style.color = '#e8e8e8';
    dateRangeLabel.textContent = 'Last 3 Months';
    dateRangeButton.appendChild(dateRangeLabel);
    
    const dateRangeMenu = document.createElement('div');
    dateRangeMenu.className = 'dropdown-menu p-0 shadow-sm';
    dateRangeMenu.style.width = '300px';
    dateRangeMenu.style.maxHeight = '400px';
    dateRangeMenu.style.overflowY = 'auto';
    
    const dateRangeSearch = document.createElement('div');
    dateRangeSearch.className = 'p-2 border-bottom sticky-top';
    dateRangeSearch.style.backgroundColor = '#1f1f1f';
    const dateRangeSearchInput = document.createElement('input');
    dateRangeSearchInput.type = 'text';
    dateRangeSearchInput.className = 'form-control form-control-sm';
    dateRangeSearchInput.placeholder = 'Search...';
    dateRangeSearchInput.id = 'tradeHistory-date-range-search';
    dateRangeSearchInput.style.backgroundColor = '#2d2d2d';
    dateRangeSearchInput.style.borderColor = '#454545';
    dateRangeSearchInput.style.color = '#e8e8e8';
    dateRangeSearch.appendChild(dateRangeSearchInput);
    
    const dateRangeList = document.createElement('div');
    dateRangeList.id = 'tradeHistory-date-range-list';
    
    dateRangeMenu.appendChild(dateRangeSearch);
    dateRangeMenu.appendChild(dateRangeList);
    
    dateRangeContainer.appendChild(dateRangeButton);
    dateRangeContainer.appendChild(dateRangeMenu);
    
    // Chart type dropdown
    const chartTypeSelect = document.createElement('select');
    chartTypeSelect.id = 'tradeHistory-chart-type-select';
    chartTypeSelect.className = 'form-select form-select-sm';
    chartTypeSelect.style.width = 'auto';
    chartTypeSelect.style.minWidth = '180px';
    
    const tradeValueOption = document.createElement('option');
    tradeValueOption.value = 'tradeValue';
    tradeValueOption.textContent = 'Trade Value';
    tradeValueOption.selected = chartType === 'tradeValue';
    chartTypeSelect.appendChild(tradeValueOption);
    
    const tradeValueStackedOption = document.createElement('option');
    tradeValueStackedOption.value = 'tradeValueStacked';
    tradeValueStackedOption.textContent = 'Trade Value Stacked';
    tradeValueStackedOption.selected = chartType === 'tradeValueStacked';
    chartTypeSelect.appendChild(tradeValueStackedOption);
    
    const tradeGainOption = document.createElement('option');
    tradeGainOption.value = 'tradeGain';
    tradeGainOption.textContent = 'Trade Gain';
    tradeGainOption.selected = chartType === 'tradeGain';
    chartTypeSelect.appendChild(tradeGainOption);
    
    const tradeGainStackedOption = document.createElement('option');
    tradeGainStackedOption.value = 'tradeGainStacked';
    tradeGainStackedOption.textContent = 'Trade Gain Stacked';
    tradeGainStackedOption.selected = chartType === 'tradeGainStacked';
    chartTypeSelect.appendChild(tradeGainStackedOption);
    
    const periodGainOption = document.createElement('option');
    periodGainOption.value = 'periodGain';
    const rollupLabels: Record<RollupPeriod, string> = { 1: 'Daily Gain History', 2: 'Weekly Gain History', 3: 'Monthly Gain History' };
    periodGainOption.textContent = rollupLabels[rollupPeriod] || 'Period Gain History';
    periodGainOption.selected = chartType === 'periodGain';
    chartTypeSelect.appendChild(periodGainOption);
    
    const periodSymbolGainOption = document.createElement('option');
    periodSymbolGainOption.value = 'periodSymbolGain';
    const rollupSymbolLabels: Record<RollupPeriod, string> = { 1: 'Daily Trade Gains', 2: 'Weekly Trade Gains', 3: 'Monthly Trade Gains' };
    periodSymbolGainOption.textContent = rollupSymbolLabels[rollupPeriod] || 'Period Trade Gains';
    periodSymbolGainOption.selected = chartType === 'periodSymbolGain';
    chartTypeSelect.appendChild(periodSymbolGainOption);
    
    chartTypeSelect.addEventListener('change', () => {
      currentChartType = chartTypeSelect.value as ChartType;
      loadTradeHistoryData(currentPeriodEnd || undefined, currentRollupPeriod, currentSymbol, currentAccountID, currentClosedState, undefined, currentGroupBy);
    });
    
    rightSide.appendChild(dateRangeContainer);
    rightSide.appendChild(chartTypeSelect);
    
    chartControlsContainer.appendChild(leftSide);
    chartControlsContainer.appendChild(rightSide);
    wrapper.appendChild(chartControlsContainer);
    
    // Chart container
    const chartContainer = document.createElement('div');
    chartContainer.id = 'tradeHistory-chart-container';
    chartContainer.style.height = '400px';
    chartContainer.style.marginBottom = '1rem';
    wrapper.appendChild(chartContainer);
  }
  
  // Bookmark bar placeholder (reuse single instance to avoid flicker)
  const bookmarkContainer = document.createElement('div');
  wrapper.appendChild(bookmarkContainer);
  if (!tradeHistoryBookmarkBar && (window as any).BookmarkBar) {
    tradeHistoryBookmarkBar = new (window as any).BookmarkBar(
      'tradeHistory',
      (state: any) => {
        if (state.sort) currentSortState = state.sort;
        // Support both numeric (1/2/3) and string ('daily'/'weekly'/'monthly') rollup values
        if (state.rollupPeriod !== undefined) {
          const savedRp = state.rollupPeriod;
          if (typeof savedRp === 'string') {
            currentRollupPeriod = savedRp === 'weekly' ? 2 : (savedRp === 'monthly' ? 3 : 1);
          } else {
            currentRollupPeriod = savedRp;
          }
        }
        if (state.symbol !== undefined) currentSymbol = state.symbol;
        if (state.accountID !== undefined) currentAccountID = state.accountID;
        if (state.closedState !== undefined) currentClosedState = state.closedState;
        if (state.brokerId !== undefined) currentBrokerId = state.brokerId;
        if (state.viewMode !== undefined) currentViewMode = state.viewMode;
        if (state.chartType !== undefined) currentChartType = state.chartType;
        if (state.dateRange !== undefined) currentDateRange = state.dateRange;
        if (state.groupBy !== undefined) currentGroupBy = state.groupBy;
        loadTradeHistoryData(currentPeriodEnd || undefined, currentRollupPeriod, currentSymbol, currentAccountID, currentClosedState, undefined, currentGroupBy);
      },
      () => ({
        sort: currentSortState,
        rollupPeriod: currentRollupPeriod,
        symbol: currentSymbol,
        accountID: currentAccountID,
        closedState: currentClosedState,
        brokerId: currentBrokerId,
        viewMode: currentViewMode,
        chartType: currentChartType,
        dateRange: currentDateRange,
        groupBy: currentGroupBy
      }),
      handleReset,
      (window as any).LUMOS_DEMO_MODE || false
    );
  }
  if (tradeHistoryBookmarkBar) {
    tradeHistoryBookmarkBar.render(bookmarkContainer);
  }
  
  // Toolbar
  renderToolbar(wrapper, onReset, onPrevPeriod, onNextPeriod, onLatest, onRollupChange, onRefreshQuotes, onResyncBrokers, rollupPeriod, onViewModeChange, viewMode, groupBy, onGroupByChange, quotesAsOf, chartType);
  
  // Apply broker filter client-side for table rendering
  let filteredRows = currentBrokerId != null
    ? tradeHistory.filter(r => r.BrokerID === currentBrokerId)
    : tradeHistory;

  // Apply tradeId filter client-side if present
  if (currentTradeFilterId !== null) {
    filteredRows = filteredRows.filter(r => r.TradeID === currentTradeFilterId);
  }

  // Render table (headers, filters, and body)
  const table = document.createElement('table');
  table.className = 'table table-hover table-sm align-middle';
  table.style.fontSize = '0.875rem';
  
  // Header
  const thead = document.createElement('thead');
  thead.className = 'table-light sticky-top';
  const headerRow = document.createElement('tr');

  const periodLabel = rollupPeriod === 1 ? 'Daily' : (rollupPeriod === 2 ? 'Weekly' : 'Monthly');

  columns.forEach((col) => {
    const th = document.createElement('th');
    th.scope = 'col';

    if (col.isNumeric) {
      th.className = 'text-center';
    }

    // Make TradeID header narrow
    if (col.key === 'TradeID') {
      th.style.width = '70px';
      th.style.minWidth = '60px';
      th.style.maxWidth = '80px';
    }

    // Apply width if specified
    if (col.width) {
      th.style.width = `${col.width}px`;
    }

    const sortIndicator = col.sortable !== false && sortState.key === col.key
      ? (sortState.direction === 'asc' ? ' ▲' : ' ▼')
      : '';

    // Replace period-specific labels for the UI header so it shows e.g. "Daily Gain"
    let headerLabel = col.label;
    if (col.key === 'PeriodGain') headerLabel = `${periodLabel} Gain`;
    if (col.key === 'PeriodGainPct') headerLabel = `${periodLabel} Gain %`;

    th.textContent = headerLabel + sortIndicator;

    if (col.sortable !== false) {
      th.style.cursor = 'pointer';
      th.style.userSelect = 'none';
      th.addEventListener('click', () => onSort(col.key));
      th.title = `Sort by ${headerLabel}`;
    }

    headerRow.appendChild(th);
  });
  
  thead.appendChild(headerRow);
  
  // Filter row
  const filterRow = document.createElement('tr');
  
  columns.forEach((col) => {
    const filterCell = document.createElement('th');
    filterCell.scope = 'col';
    
    if (col.key === 'TradeID') {
      const input = document.createElement('input');
      input.type = 'number';
      input.className = 'form-control form-control-sm';
      input.placeholder = 'ID';
      input.style.width = '70px';
      if (currentTradeFilterId !== null) input.value = currentTradeFilterId.toString();
      input.addEventListener('change', () => {
        const val = input.value.trim();
        handleTradeIdFilterChange(val ? parseInt(val, 10) : null);
      });
      filterCell.appendChild(input);
    }

    if (col.key === 'Symbol') {
      const options: Array<{value: string; label: string; group?: string}> = [];

      // Add Symbol Groups
      if (lumosSymbolGroups) {
        const distinctSymbolSet = new Set(distinctSymbols);
        lumosSymbolGroups.forEach(sg => {
          if (sg.Symbols) {
            const groupSymbols = sg.Symbols.split(',').map(s => s.trim());
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

      const dropdown = (window as any).createSearchableDropdown(
        options,
        currentSymbol,
        'All',
        (val: string | null) => handleSymbolFilterChange(val)
      );
      
      filterCell.appendChild(dropdown);
    }
    
    if (col.key === 'AccountName') {
      const selectedValue = currentAccountID !== null
        ? currentAccountID.toString()
        : (currentBrokerId !== null ? `broker:${currentBrokerId}` : null);
      const options = buildAccountFilterOptions();
      const dropdown = (window as any).createSearchableDropdown(
        options,
        selectedValue,
        'All',
        (val: string | null) => {
          if (!val) {
            currentBrokerId = null;
            handleAccountFilterChange(null);
            return;
          }
          if (val.startsWith('broker:')) {
            const id = parseInt(val.replace('broker:', ''), 10);
            currentAccountID = null;
            currentBrokerId = Number.isFinite(id) ? id : null;
            loadTradeHistoryData(currentPeriodEnd || undefined, currentRollupPeriod, currentSymbol, currentAccountID, currentClosedState, undefined, currentGroupBy);
            return;
          }
          currentBrokerId = null;
          handleAccountFilterChange(parseInt(val, 10));
        }
      );
      
      filterCell.appendChild(dropdown);
    }
    
    if (col.key === 'Closed') {
      const select = document.createElement('select');
      select.className = 'form-select form-select-sm';
      
      const options = [
        { value: 'all', label: 'All' },
        { value: 'open', label: 'OPEN' },
        { value: 'closed', label: 'CLOSED' }
      ];

      options.forEach(opt => {
        const option = document.createElement('option');
        option.value = opt.value;
        option.textContent = opt.label;
        if (opt.value === currentClosedState) {
          option.selected = true;
        }
        select.appendChild(option);
      });

      select.addEventListener('change', () => {
        handleClosedStateChange(select.value as ClosedState);
      });

      filterCell.appendChild(select);
    }
    
    filterRow.appendChild(filterCell);
  });

  thead.appendChild(filterRow);
  table.appendChild(thead);
  
  // Body - only render when in table mode
  if (viewMode === 'table') {
    const tbody = document.createElement('tbody');

    filteredRows.forEach((row) => {
      const tr = document.createElement('tr');

      columns.forEach((col) => {
        const td = document.createElement('td');
        
        if (col.isNumeric) {
          td.className = 'text-center';
        }
        
        // Apply background color to gain percentage columns based on value
        if (col.key === 'PeriodGainPct' || col.key === 'TotalGainPct') {
          const pctValue = row[col.key];
          if (pctValue !== null && pctValue !== undefined) {
            if (pctValue >= 0) {
              td.classList.add('cell-win-bg');
            } else {
              td.classList.add('cell-loss-bg');
            }
          }
        }
        
        // Make TradeID cell narrow
        if (col.key === 'TradeID') {
          td.style.width = '70px';
          td.style.minWidth = '60px';
          td.style.maxWidth = '80px';
        }
        
        if (col.key === 'CurrentValue' || col.key === 'CurrentCost') {
          const wrapperDiv = document.createElement('div');
          wrapperDiv.style.display = 'flex';
          wrapperDiv.style.flexDirection = 'column';
          wrapperDiv.style.alignItems = 'center';
          wrapperDiv.style.justifyContent = 'center';

          const isClosedTrade = row.Closed === true;
          const avgEntryAvailable = row.AvgEntryPrice !== null && row.AvgEntryPrice !== undefined;
          const avgExitAvailable = row.AvgExitPrice !== null && row.AvgExitPrice !== undefined;
          const showClosedFormat = isClosedTrade && (
            (col.key === 'CurrentCost' && avgEntryAvailable) ||
            (col.key === 'CurrentValue' && avgExitAvailable)
          );

          const shouldShowDash = !showClosedFormat && (
            (col.key === 'CurrentCost' && (row.CurrentCost === null || row.CurrentCost === 0)) ||
            (col.key === 'CurrentValue' && (row.CurrentValue === null || row.CurrentValue === 0))
          );

          if (showClosedFormat) {
            const closedDiv = document.createElement('div');
            closedDiv.style.whiteSpace = 'nowrap';
            closedDiv.textContent = 'Closed';
            wrapperDiv.appendChild(closedDiv);

            const secondLineDiv = document.createElement('div');
            secondLineDiv.style.fontSize = '0.75rem';
            secondLineDiv.style.fontStyle = 'italic';
            secondLineDiv.style.color = 'rgba(255, 255, 255, 0.6)';
            secondLineDiv.style.marginTop = '2px';
            secondLineDiv.style.whiteSpace = 'nowrap';

            if (col.key === 'CurrentCost') {
              secondLineDiv.textContent = `Risked: ${formatCurrency(row.LargestRisk ?? 0)}`;
            } else {
              const gain = row.TotalGain ?? 0;
              const risk = row.LargestRisk ?? 0;
              const rewardRisk = risk !== 0 ? Math.round((gain / risk) * 100) : 0;
              secondLineDiv.textContent = `Reward/Risk: ${rewardRisk}%`;
            }
            wrapperDiv.appendChild(secondLineDiv);

            const priceDiv = document.createElement('div');
            priceDiv.style.fontSize = '0.75rem';
            priceDiv.style.fontStyle = 'italic';
            priceDiv.style.color = 'rgba(255, 255, 255, 0.6)';
            priceDiv.style.whiteSpace = 'nowrap';

            if (col.key === 'CurrentCost') {
              const label = row.LongTrade === false ? 'Avg Short' : 'Avg Buy';
              priceDiv.textContent = `${label}: ${formatCurrency(row.AvgEntryPrice ?? 0)}`;
            } else {
              const label = row.LongTrade === false ? 'Avg Cover' : 'Avg Sell';
              priceDiv.textContent = `${label}: ${formatCurrency(row.AvgExitPrice ?? 0)}`;
            }
            wrapperDiv.appendChild(priceDiv);
          } else {
            const amountDiv = document.createElement('div');
            amountDiv.style.whiteSpace = 'nowrap';
            const amount = shouldShowDash
              ? '—'
              : col.key === 'CurrentCost'
                ? formatCurrency(row.CurrentCost ?? 0)
                : formatCurrency(row.CurrentValue ?? 0);
            amountDiv.textContent = amount;
            wrapperDiv.appendChild(amountDiv);
          }

          let detailDivForTooltip: HTMLElement | null = null;
          if (!showClosedFormat && !shouldShowDash) {
            const detailDiv = document.createElement('div');
            detailDiv.style.fontSize = '0.75rem';
            detailDiv.style.fontStyle = 'italic';
            detailDiv.style.color = '#6c757d';
            detailDiv.style.marginTop = '2px';
            detailDiv.style.whiteSpace = 'nowrap';
            detailDiv.style.display = 'flex';
            detailDiv.style.alignItems = 'center';
            detailDiv.style.justifyContent = 'center';
            detailDiv.style.gap = '4px';

            if (col.key === 'CurrentCost') {
              const breakeven = row.BreakevenPriceAtPeriodEnd;
              const openQty = row.OpenQuantityAtPeriodEnd;
              if (openQty && breakeven !== null && breakeven !== undefined && breakeven !== 0) {
                const textSpan = document.createElement('span');
                textSpan.textContent = `${formatQuantity(openQty)} @ ${formatCurrency(breakeven)}`;
                detailDiv.appendChild(textSpan);
                wrapperDiv.appendChild(detailDiv);
                detailDivForTooltip = detailDiv;
              }
            } else {
              const priceAtPeriodEnd = row.CurrentPriceAtPeriodEnd;
              const openQty = row.OpenQuantityAtPeriodEnd;
              if (openQty && priceAtPeriodEnd !== null && priceAtPeriodEnd !== undefined && priceAtPeriodEnd !== 0) {
                const textSpan = document.createElement('span');
                textSpan.textContent = `${formatQuantity(openQty)} @ ${formatCurrency(priceAtPeriodEnd)}`;
                detailDiv.appendChild(textSpan);
                wrapperDiv.appendChild(detailDiv);
                detailDivForTooltip = detailDiv;
              }
            }
          }

          const tooltipLines: string[] = [];
          let shouldShowTooltip = false;

          if (!showClosedFormat) {
            if (col.key === 'CurrentCost') {
              const breakeven = row.BreakevenPriceAtPeriodEnd ?? 0;
              const avgEntry = row.AvgEntryPrice ?? 0;
              const isDifferent = Math.abs(breakeven - avgEntry) > 0.01;
              if (isDifferent) {
                if (breakeven !== 0) {
                  tooltipLines.push(
                    `<div class="tooltip-line"><strong>Breakeven:</strong> ${formatCurrency(breakeven)}</div>`
                  );
                  shouldShowTooltip = true;
                }
                if (row.AvgEntryPrice !== null && row.AvgEntryPrice !== undefined && row.AvgEntryPrice !== 0) {
                  const entryLabel = row.LongTrade === false ? 'Avg Sell Short Price' : 'Avg Buy Price';
                  tooltipLines.push(`<div class="tooltip-line"><strong>${entryLabel}:</strong> ${formatCurrency(row.AvgEntryPrice)}</div>`);
                }
              }
            } else {
              const avgExit = row.AvgExitPrice ?? null;
              const hasAvgExit = avgExit !== null && avgExit !== 0;
              if (hasAvgExit) {
                if (row.CurrentPriceAtPeriodEnd !== null && row.CurrentPriceAtPeriodEnd !== undefined && row.CurrentPriceAtPeriodEnd !== 0) {
                  tooltipLines.push(
                    `<div class="tooltip-line"><strong>Current Price:</strong> ${formatCurrency(row.CurrentPriceAtPeriodEnd)}</div>`
                  );
                }
                const exitLabel = row.LongTrade === false ? 'Avg Buy to Cover Price' : 'Avg Sell Price';
                tooltipLines.push(`<div class="tooltip-line"><strong>${exitLabel}:</strong> ${formatCurrency(avgExit)}</div>`);
                shouldShowTooltip = true;
              }
            }
          }

          if (shouldShowTooltip && tooltipLines.length > 0 && detailDivForTooltip) {
            const info = document.createElement('i');
            info.className = 'fa-solid fa-circle-info text-muted';
            info.setAttribute('data-bs-toggle', 'tooltip');
            info.setAttribute('data-bs-html', 'true');
            info.setAttribute('title', tooltipLines.join(''));
            info.style.cursor = 'pointer';
            info.style.fontSize = '0.65rem';
            info.style.lineHeight = '1';
            detailDivForTooltip.appendChild(info);
          }

          td.appendChild(wrapperDiv);
          tr.appendChild(td);
          return;
        }

        if (col.key === 'TotalGain') {
          const gainValue = row.TotalGain ?? null;

          if (gainValue === null) {
            td.textContent = '—';
            tr.appendChild(td);
            return;
          }

          const mainWrapperDiv = document.createElement('div');
          mainWrapperDiv.style.display = 'flex';
          mainWrapperDiv.style.flexDirection = 'column';
          mainWrapperDiv.style.alignItems = 'center';
          mainWrapperDiv.style.justifyContent = 'center';

          const realized = row.RealizedGainAtPeriodEnd ?? 0;
          const unrealized = row.UnrealizedGainAtPeriodEnd ?? 0;
          const total = gainValue ?? 0;
          const gainClass = (value: number): string => {
            const rounded = Math.round(value * 100) / 100;
            return rounded > 0 ? 'gain-positive' : (rounded < 0 ? 'gain-negative' : '');
          };
          const realizedCls = gainClass(realized);
          const unrealizedCls = gainClass(unrealized);
          const totalCls = gainClass(total);

          // Round realized gain to check if it's actually zero after rounding
          const roundedRealized = Math.round(realized);
          const hasRealizedGain = realized !== null && realized !== undefined && realized !== 0 && roundedRealized !== 0;

          const wrapperDiv = document.createElement('div');
          wrapperDiv.style.display = 'flex';
          wrapperDiv.style.alignItems = 'center';
          wrapperDiv.style.justifyContent = 'center';
          wrapperDiv.style.gap = '4px';

          const gainSpan = document.createElement('span');
          gainSpan.className = gainValue > 0 ? 'val-positive' : (gainValue < 0 ? 'val-negative' : '');
          gainSpan.textContent = formatCurrency(gainValue);
          wrapperDiv.appendChild(gainSpan);

          // Add tooltip icon on first line if realized gain exists
          if (hasRealizedGain) {
            const [realizedPct, unrealizedPct] = computeTwoPartPercentages(realized, unrealized);
            
            const tooltipLines = [
              `<div class="tooltip-line"><strong>Realized Gain:</strong> <span class="${realizedCls}">${formatCurrency(realized)} (${realizedPct}%)</span></div>`,
              `<div class="tooltip-line"><strong>Unrealized Gain:</strong> <span class="${unrealizedCls}">${formatCurrency(unrealized)} (${unrealizedPct}%)</span></div>`,
              `<div class="tooltip-line"><strong>Total Gain:</strong> <span class="${totalCls}">${formatCurrency(total)}</span></div>`
            ];

            const info = document.createElement('i');
            info.className = 'fa-solid fa-circle-info text-muted';
            info.setAttribute('data-bs-toggle', 'tooltip');
            info.setAttribute('data-bs-html', 'true');
            info.setAttribute('title', tooltipLines.join(''));
            info.style.cursor = 'pointer';
            info.style.fontSize = '0.75rem';
            info.style.lineHeight = '1';
            wrapperDiv.appendChild(info);
          }

          mainWrapperDiv.appendChild(wrapperDiv);

          // Add detail lines for realized gain
          if (hasRealizedGain) {
            // Amount and percentage line
            const amountDiv = document.createElement('div');
            amountDiv.style.fontSize = '0.75rem';
            amountDiv.style.fontStyle = 'italic';
            amountDiv.style.color = 'rgba(255, 255, 255, 0.6)';
            amountDiv.style.marginTop = '2px';
            amountDiv.style.whiteSpace = 'nowrap';
            amountDiv.style.textAlign = 'center';

            // Calculate percentage of total gain (absolute values and sum to 100)
            let percentText = '';
            if (Math.abs(realized) + Math.abs(unrealized) !== 0) {
              const [percent] = computeTwoPartPercentages(realized, unrealized);
              percentText = ` (${percent}%)`;
            }

            const sign = roundedRealized < 0 ? '-' : '';
            const absValue = Math.abs(roundedRealized);
            const formattedRealized = `${sign}$${absValue.toLocaleString()}`;

            amountDiv.textContent = `${formattedRealized}${percentText}`;
            mainWrapperDiv.appendChild(amountDiv);

            // "Realized" label line
            const labelDiv = document.createElement('div');
            labelDiv.style.fontSize = '0.75rem';
            labelDiv.style.fontStyle = 'italic';
            labelDiv.style.color = 'rgba(255, 255, 255, 0.6)';
            labelDiv.style.whiteSpace = 'nowrap';
            labelDiv.style.textAlign = 'center';
            labelDiv.textContent = 'Realized';
            
            mainWrapperDiv.appendChild(labelDiv);
          }

          td.appendChild(mainWrapperDiv);
          tr.appendChild(td);
          return;
        }

        const raw = col.formatter ? col.formatter(row) : String(row[col.key] ?? '');
        
        // Create static anchor links for TradeID and Account columns
        let cellContent: string | null = null;
        if (col.key === 'TradeID' && row.TradeID) {
          const badgeClass = row.Closed === false ? 'badge-open' : 'badge-closed';
          const badgeText = row.Closed === false ? 'OPEN' : 'CLOSED';
          cellContent = `<div><a href="/trades?tradeId=${row.TradeID}" class="text-decoration-none" style="color: inherit;">${raw}</a><div><span class="badge mt-1 ${badgeClass}" style="border:1px solid rgba(0,0,0,0.05)">${badgeText}</span></div></div>`;
        } else if (col.key === 'AccountName') {
          const rollupMap: Record<number, string> = { 1: 'daily', 2: 'weekly', 3: 'monthly' };
          const rollupStr = rollupMap[currentRollupPeriod] || 'daily';
          const wrapperDiv = document.createElement('div');
          const accountDiv = document.createElement('div');
          if (row.AccountID) {
            const link = document.createElement('a');
            link.href = `/accountHistory?accountId=${row.AccountID}&rollupPeriod=${rollupStr}`;
            link.className = 'text-decoration-none';
            link.style.color = 'inherit';
            link.textContent = raw;
            accountDiv.appendChild(link);
          } else {
            accountDiv.textContent = raw;
          }
          wrapperDiv.appendChild(accountDiv);

          const brokerName = row.BrokerName ?? (row.BrokerID ? (brokerNameById.get(row.BrokerID) ?? `Broker ${row.BrokerID}`) : null);
          if (brokerName && row.BrokerID) {
            const brokerDiv = document.createElement('div');
            brokerDiv.style.fontSize = '0.75rem';
            brokerDiv.style.fontStyle = 'italic';
            brokerDiv.style.color = '#6c757d';
            brokerDiv.style.marginTop = '2px';
            const brokerLink = document.createElement('a');
            brokerLink.href = `/accountHistory?brokerId=${row.BrokerID}&rollupPeriod=${rollupStr}`;
            brokerLink.className = 'text-decoration-none';
            brokerLink.style.color = '#6c757d';
            brokerLink.textContent = brokerName;
            brokerDiv.appendChild(brokerLink);
            wrapperDiv.appendChild(brokerDiv);
          } else if (brokerName) {
            const brokerDiv = document.createElement('div');
            brokerDiv.style.fontSize = '0.75rem';
            brokerDiv.style.fontStyle = 'italic';
            brokerDiv.style.color = '#6c757d';
            brokerDiv.style.marginTop = '2px';
            brokerDiv.textContent = brokerName;
            wrapperDiv.appendChild(brokerDiv);
          }

          td.appendChild(wrapperDiv);
          tr.appendChild(td);
          return;
        }

        if (cellContent) {
          td.innerHTML = cellContent;
        } else {
          const hasHtml = /<\/?[a-z][\s\S]*>/i.test(raw);
          if (hasHtml) {
            td.innerHTML = raw;
          } else {
            td.textContent = raw;
          }
        }
        
        tr.appendChild(td);
      });
      
      tbody.appendChild(tr);
    });
    
    table.appendChild(tbody);
  } else {
    // In chart mode, show a message instead of table data
    const tbody = document.createElement('tbody');
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = columns.length;
    td.className = 'text-center text-muted py-4';
    td.innerHTML = '<i class="fa-solid fa-chart-line me-2"></i>Charting trade history';
    tr.appendChild(td);
    tbody.appendChild(tr);
    table.appendChild(tbody);
  }
  
  wrapper.appendChild(table);
  ensureRenderRowCount(wrapper, tradeHistory.length, viewMode === 'chart' ? 'charted' : 'displayed');
  
  mountPoint.replaceChildren(wrapper);

  const initBootstrapTooltips = () => {
    const bs = (window as any).bootstrap;
    if (!bs || !bs.Tooltip) return;
    const tooltipEls = wrapper.querySelectorAll('[data-bs-toggle="tooltip"]');
    tooltipEls.forEach((el) => {
      try {
        const existing = (el as any).__bs_tooltip;
        if (existing && typeof existing.dispose === 'function') {
          existing.dispose();
        }
      } catch (e) {
        // ignore
      }
      try {
        (el as any).__bs_tooltip = new bs.Tooltip(el, {
          html: true,
          sanitize: false,
          container: document.body,
          template: '<div class="tooltip" role="tooltip"><div class="tooltip-arrow"></div><div class="tooltip-inner text-start"></div></div>'
        });
      } catch (e) {
        // ignore
      }
    });
  };
  initBootstrapTooltips();
  
  // Render chart when in chart mode
  if (viewMode === 'chart') {
    const chartContainer = document.getElementById('tradeHistory-chart-container');
    if (chartContainer) {
      renderChart(chartContainer, tradeHistory, chartType);
    }
    
    // Initialize date range dropdown after chart container is in DOM
    setTimeout(() => initializeDateRangeDropdown(), 0);
  }
  
  // Update navigation buttons
  const nextBtn = document.getElementById('tradeHistory-next-btn') as HTMLButtonElement;
  if (nextBtn) {
    nextBtn.disabled = isLatestPeriod;
  }
};

const setLoadingState = (mountPoint: HTMLElement, message: string = 'Loading trade history...') => {
  mountPoint.innerHTML = `
    <div class="text-center py-5">
      <div class="spinner-border spinner-border-sm text-secondary me-2" role="status"></div>
      <span class="fs-5 text-muted align-middle">${message}</span>
    </div>
  `;
};

const initializeDateRangeDropdown = () => {
  if (!(window as any).DateRangeDropdown) {
    console.warn('[tradeHistoryClient] DateRangeDropdown not available');
    return;
  }
  
  if (dateRangeDropdown) {
    // Already initialized, just update the value and accountId if needed
    dateRangeDropdown.setValue(currentDateRange);
    dateRangeDropdown.setAccountId(currentAccountID);
    return;
  }
  
  dateRangeDropdown = new (window as any).DateRangeDropdown({
    containerId: 'tradeHistory-date-range-dropdown',
    searchInputId: 'tradeHistory-date-range-search',
    listContainerId: 'tradeHistory-date-range-list',
    labelElementId: 'tradeHistory-date-range-label',
    milestones: MILESTONES,
    defaultValue: currentDateRange,
    accountId: currentAccountID,
    onChange: (value: string) => {
      console.log('[tradeHistoryClient] Date range changed to:', value);
      currentDateRange = value;
      loadTradeHistoryData(undefined, currentRollupPeriod, currentSymbol, currentAccountID, currentClosedState, undefined, currentGroupBy);
    }
  });
};

const loadTradeHistoryData = async (
  periodEnd?: string,
  rollupPeriod: RollupPeriod = 1,
  symbol: string | null = null,
  accountID: number | null = null,
  closedState: ClosedState = 'all',
  operation?: 'previous' | 'next',
  groupBy: 'symbol' | 'symbolGroup' = 'symbol'
) => {
  const mountPoint = document.querySelector('[data-tradeHistory-table-root]') as HTMLElement;
  if (!mountPoint) {
    console.error('[tradeHistoryClient] Mount point not found');
    return;
  }
  
  let loadingTimer: number | null = window.setTimeout(() => setLoadingState(mountPoint), 250);

  const handleResyncBrokers = async () => {
    setLoadingState(mountPoint, 'Refreshing Orders...');
    try {
      const response = await fetch('/request/importTrades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const result = await response.json();
      // Reload data
      await loadTradeHistoryData(currentPeriodEnd || undefined, currentRollupPeriod, currentSymbol, currentAccountID, currentClosedState, undefined, currentGroupBy);
      
      if (!result.success && result.error) {
        (window as any).LumosErrorUtils.displayDismissibleError(mountPoint, result.error, 'Resync Orders completed with errors');
      }
    } catch (error) {
      console.error('Resync error:', error);
      // Reload data to restore view
      await loadTradeHistoryData(currentPeriodEnd || undefined, currentRollupPeriod, currentSymbol, currentAccountID, currentClosedState, undefined, currentGroupBy);
    }
  };

  const handleRefreshQuotes = async () => {
    setLoadingState(mountPoint, 'Refreshing Quotes...');
    try {
      const response = await fetch('/request/importQuotes', { method: 'POST' });
      const result = await response.json();
      // Reload data with existing filters
      await loadTradeHistoryData(currentPeriodEnd || undefined, currentRollupPeriod, currentSymbol, currentAccountID, currentClosedState, undefined, currentGroupBy);
      if (!result.success && result.error) {
        (window as any).LumosErrorUtils.displayDismissibleError(mountPoint, result.error, 'Refresh Quotes completed with errors');
      } else if (result.refreshErrors) {
        (window as any).LumosErrorUtils.displayDismissibleError(mountPoint, result.refreshErrors, 'Refresh Quotes completed with errors');
      }
    } catch (error) {
      console.error('Refresh quotes error:', error);
      await loadTradeHistoryData(currentPeriodEnd || undefined, currentRollupPeriod, currentSymbol, currentAccountID, currentClosedState, undefined, currentGroupBy);
    }
  };

  try {
    // In chart mode, use dateRange instead of periodEnd (except for periodSymbolGain which uses single period)
    const useRangeMode = currentViewMode === 'chart' && currentChartType !== 'periodSymbolGain';
    const data = await fetchTradeHistoryData(
      currentSortState, 
      useRangeMode ? undefined : periodEnd, 
      rollupPeriod, 
      symbol, 
      accountID, 
      closedState, 
      useRangeMode ? undefined : operation,
      useRangeMode ? currentDateRange : undefined,
      useRangeMode ? currentChartType : undefined,
      currentBrokerId,
      groupBy
    );

    // Preserve any server-provided quotes timestamp for later display
    (mountPoint as any).__serverQuotesAsOf = (data as any).quotesAsOf ?? null;

    // Client-side fallback sorting for TradeID when server doesn't honor it
    if (currentSortState.key === 'TradeID') {
      const dir = currentSortState.direction === 'asc' ? 1 : -1;
      data.tradeHistory.sort((a, b) => (Number(a.TradeID) - Number(b.TradeID)) * dir);
    }

    currentSortState = data.sort as SortState;
    currentPeriodEnd = data.periodEnd;
    currentRollupPeriod = data.rollupPeriod;
    currentSymbol = symbol;
    currentAccountID = accountID;
    currentClosedState = closedState;
    
    // Extract distinct symbols from the data
    distinctSymbols = [...new Set(data.tradeHistory.map(row => row.Symbol))].sort();
    
    
    if (loadingTimer) { clearTimeout(loadingTimer); loadingTimer = null; }

    // Compute a human-friendly 'Quotes as of' string using the same logic as Trades
    const etFormatter = new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'America/New_York'
    });

    let quotesAsOfRendered: string | null = null;
    const serverQuotesAsOf = (mountPoint as any).__serverQuotesAsOf as string | null | undefined;
    if (serverQuotesAsOf) {
      const d = new Date(serverQuotesAsOf);
      if (!isNaN(d.getTime())) {
        quotesAsOfRendered = etFormatter.format(d);
      }
    }

    if (!quotesAsOfRendered) {
      // Trade history rows don't carry per-symbol CurrentPriceDateTime, so fall back to a helpful message
      quotesAsOfRendered = 'Current quotes are not available. Click Refresh Quotes.';
    }

    const handleViewModeChange = (mode: ViewMode) => {
      currentViewMode = mode;
      loadTradeHistoryData(currentPeriodEnd || undefined, currentRollupPeriod, currentSymbol, currentAccountID, currentClosedState, undefined, currentGroupBy);
    };

    renderTradeHistoryTable(
      mountPoint,
      data.tradeHistory,
      data.asOf,
      data.periodStart,
      data.periodEnd,
      data.isLatestPeriod,
      data.rollupPeriod,
      currentSortState,
      handleSort,
      handleReset,
      handlePreviousPeriod,
      handleNextPeriod,
      handleLatestPeriod,
      handleRollupPeriodChange,
      handleRefreshQuotes,
      handleResyncBrokers,
      handleViewModeChange,
      currentViewMode,
      currentChartType,
      currentGroupBy,
      handleGroupByChange,
      quotesAsOfRendered
    );

    // Update the top-right "Quotes as of" display (like Trades page)
    const dateDisplay = document.getElementById('tradeHistory-date-display');
    if (dateDisplay) {
      // Only prefix if it's a real date, not the fallback message
      if (serverQuotesAsOf && quotesAsOfRendered && !quotesAsOfRendered.startsWith('Current quotes')) {
        dateDisplay.innerHTML = `<em>Quotes as of ${quotesAsOfRendered}</em>`;
      } else {
        dateDisplay.innerHTML = quotesAsOfRendered ? `<em>${quotesAsOfRendered}</em>` : '';
      }
    }
  } catch (error) {
    console.error('[tradeHistoryClient] Error loading trade history:', error);
    if (loadingTimer) { clearTimeout(loadingTimer); loadingTimer = null; }
    mountPoint.innerHTML = `
      <div class="alert alert-danger">
        <strong>Error loading trade history:</strong> ${error instanceof Error ? error.message : 'Unknown error'}
      </div>
    `;
  }
};

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  // Initialize with defaults
  currentSortState = DEFAULT_SORT;
  currentRollupPeriod = DEFAULT_ROLLUP_PERIOD;
  currentSymbol = null;
  currentAccountID = null;
  currentClosedState = DEFAULT_CLOSED_STATE;
  currentBrokerId = null;
  currentViewMode = DEFAULT_VIEW_MODE;
  currentChartType = DEFAULT_CHART_TYPE;
  currentDateRange = DEFAULT_DATE_RANGE;
  currentGroupBy = DEFAULT_GROUP_BY;
  // If the URL contains a periodEnd or rollupPeriod param, honor it as initial filters
  const urlParams = new URLSearchParams(window.location.search);
  const periodEndParam = urlParams.get('periodEnd');
  if (periodEndParam && periodEndParam !== '' && periodEndParam !== 'null') {
    // Accept YYYY-MM-DD or ISO strings; keep the date-only form to avoid timezone issues
    currentPeriodEnd = periodEndParam.length >= 10 ? periodEndParam.substring(0, 10) : periodEndParam;
  }
  const rpParam = urlParams.get('rollupPeriod');
  if (rpParam && rpParam !== '' && rpParam !== 'null') {
    const rpNum = parseInt(rpParam, 10);
    if ([1,2,3].includes(rpNum)) currentRollupPeriod = rpNum as RollupPeriod;
  }
  const accountIdParam = urlParams.get('accountId');
  if (accountIdParam && accountIdParam !== '' && accountIdParam !== 'null') {
    const accountNum = parseInt(accountIdParam, 10);
    if (!isNaN(accountNum)) currentAccountID = accountNum;
  }
  const brokerIdParam = urlParams.get('brokerId');
  if (brokerIdParam && brokerIdParam !== '' && brokerIdParam !== 'null') {
    const brokerNum = parseInt(brokerIdParam, 10);
    if (!isNaN(brokerNum)) currentBrokerId = brokerNum;
  }
  const tradeIdParam = urlParams.get('tradeId');
  if (tradeIdParam && tradeIdParam !== '' && tradeIdParam !== 'null') {
    const tradeNum = parseInt(tradeIdParam, 10);
    if (!isNaN(tradeNum)) currentTradeFilterId = tradeNum;
  }
  const symbolParam = urlParams.get('symbol');
  if (symbolParam && symbolParam !== 'all' && symbolParam !== '') {
    currentSymbol = symbolParam;
  }

  // Load with periodEnd if provided so the page pre-selects the requested date
  loadTradeHistoryData(currentPeriodEnd || undefined, currentRollupPeriod, currentSymbol, currentAccountID, currentClosedState);
  
  // Title click resets filters (consistent with Accounts page)
  const tradeHistoryTitle = document.getElementById('tradeHistory-title') as HTMLElement | null;
  if (tradeHistoryTitle) {
    tradeHistoryTitle.addEventListener('click', () => {
      handleReset();
    });
  }
});

})(); // End of IIFE
