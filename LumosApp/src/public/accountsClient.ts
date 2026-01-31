// Wrap in IIFE to avoid global scope conflicts with other client files
(function() {

type AccountBalanceRow = {
  AccountID: number | null;
  Name: string;
  BrokerID?: number | null;
  BrokerName?: string | null;
  Balance: number | null;
  BalanceChangeAmount: number | null;
  BalanceChangePct: number | null;
  InvestedAmount: number | null;
  NetGain: number | null;
  NetGainPct: number | null;
  TransferAmount: number | null;
  TransferDescription: string | null;
  OrdersExecuted: number | null;
  Comment: string | null;
  BalanceUpdateTime: string | null;
  PeriodEnd: string | null;
  DrawdownFromATH: number | null;
  DrawdownPctFromATH: number | null;
  AllTimeHigh: number | null;
  AllTimeHighDate: string | null;
  AllTimeHighRangeStart: string | null;
};

type SortDirection = 'asc' | 'desc';
type ColumnKey = keyof AccountBalanceRow;

type SortState = {
  key: ColumnKey;
  direction: SortDirection;
};

type RollupPeriod = 1 | 2 | 3; // Daily = 1, Weekly = 2, Monthly = 3

// Charts toggle state (default: off)
let showCharts: boolean = false;

const DEFAULT_SORT: SortState = { key: 'Name', direction: 'asc' };
const DEFAULT_ROLLUP_PERIOD: RollupPeriod = 1;

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

type AccountsApiResponse = {
  asOf: string;
  periodEnd: string;
  periodStart: string;
  isLatestPeriod: boolean;
  rollupPeriod: RollupPeriod;
  accounts: AccountBalanceRow[];
  brokers?: Array<{ BrokerID: number; Name: string }>;
  sort: SortState;
  refreshErrors?: string;
  operationType?: string;
};

type ColumnConfig = {
  key: ColumnKey;
  label: string;
  dataType: 'number' | 'string' | 'date' | 'boolean';
  formatter?: (row: AccountBalanceRow) => string;
  isNumeric?: boolean;
  sortable?: boolean;
};

const REQUEST_ENDPOINT = '/request/accounts';

const numberFormatter = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short'
});

// Parse dates from server and prepare them for display in America/New_York.
// Addresses off-by-one issues where server provides date-only values (or ISO midnight UTC)
// which, when converted to America/New_York, appear as the previous day.
const parseDateForEasternDisplay = (s: string | null | undefined): Date | null => {
  if (!s) return null;
  // Plain date string (YYYY-MM-DD) — treat as date-only, use noon UTC to avoid timezone shifts
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return new Date(s + 'T12:00:00Z');
  }
  // ISO that is midnight UTC (e.g., 2026-01-06T00:00:00.000Z) — treat as date-only
  const m = s.match(/^(\d{4}-\d{2}-\d{2})T00:00:00(?:\.0+)?Z$/);
  if (m) {
    return new Date(m[1] + 'T12:00:00Z');
  }
  // Otherwise, parse normally (full datetime with timezone)
  return new Date(s);
};

const formatCurrency = (value: number): string => {
  if (value < 0) {
    return `($${numberFormatter.format(Math.abs(value))})`;
  }
  return `$${numberFormatter.format(value)}`;
};

const formatPercent = (value: number): string => {
  const pctFormatter = new Intl.NumberFormat(undefined, {
    style: 'percent',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  return pctFormatter.format(value);
};

const getPeriodLabel = (rollupPeriod: RollupPeriod): string => {
  switch (rollupPeriod) {
    case 1: return 'Daily';
    case 2: return 'Weekly';
    case 3: return 'Monthly';
    default: return 'Daily';
  }
};

const getColumnLabel = (key: ColumnKey, rollupPeriod: RollupPeriod): string => {
  const periodLabel = getPeriodLabel(rollupPeriod);
  const labelMap: { [K in ColumnKey]?: string } = {
    'BrokerName': 'Broker',
    'Name': 'Account Name',
    'Balance': 'Current Balance',
    'BalanceChangeAmount': `${periodLabel} Change`,
    'BalanceChangePct': `${periodLabel} Change %`,
    'InvestedAmount': 'Invested Amount',
    'NetGain': 'Total Gain',
    'NetGainPct': 'Total Gain %',
    'DrawdownFromATH': 'Drawdown from All Time High',
    'TransferAmount': `${periodLabel} Transfers`,
    'OrdersExecuted': 'Orders Placed',
    'Comment': 'Comment'
  };
  return labelMap[key] || String(key);
};

const getColumns = (rollupPeriod: RollupPeriod): ColumnConfig[] => [
  {
    key: 'BrokerName' as any,
    label: 'Broker',
    dataType: 'string',
    sortable: true,
    formatter: (row) => {
      if (!row.BrokerName) return '—';
      if (!row.BrokerID) return row.BrokerName;
      return `<a href="/accountHistory?brokerId=${row.BrokerID}&rollupPeriod=${rollupPeriod}" class="text-decoration-none" style="color: inherit; cursor: pointer;">${row.BrokerName}</a>`;
    }
  },
  { 
    key: 'Name', 
    label: 'Account Name', 
    dataType: 'string', 
    sortable: true,
    formatter: (row) => {
      if (row.AccountID === null) return row.Name;
      // Use the default text color but show pointer cursor for clickable account name
      return `<a href="/accountHistory?accountId=${row.AccountID}&rollupPeriod=${rollupPeriod}" class="text-decoration-none" style="color: inherit; cursor: pointer;">${row.Name}</a>`;
    }
  },
  {
    key: 'Balance',
    label: 'Current Balance',
    dataType: 'number',
    isNumeric: true,
    sortable: true,
    formatter: (row) => (row.Balance === null ? '—' : formatCurrency(row.Balance))
  },
  {
    key: 'BalanceChangeAmount',
    label: getColumnLabel('BalanceChangeAmount', rollupPeriod),
    dataType: 'number',
    isNumeric: true,
    sortable: true,
    formatter: (row) => {
      if (row.BalanceChangeAmount === null) return '—';
      const cls = row.BalanceChangeAmount > 0 ? 'val-positive' : (row.BalanceChangeAmount < 0 ? 'val-negative' : '');
      return `<span class="${cls}">${formatCurrency(row.BalanceChangeAmount)}</span>`;
    }
  },
  {
    key: 'BalanceChangePct',
    label: getColumnLabel('BalanceChangePct', rollupPeriod),
    dataType: 'number',
    isNumeric: true,
    sortable: true,
    formatter: (row) => {
      if (row.BalanceChangePct === null) return '—';
      const cls = row.BalanceChangePct > 0 ? 'val-positive' : (row.BalanceChangePct < 0 ? 'val-negative' : '');
      return `<span class="${cls}">${formatPercent(row.BalanceChangePct)}</span>`;
    }
  },
  {
    key: 'InvestedAmount',
    label: 'Invested Amount',
    dataType: 'number',
    isNumeric: true,
    sortable: true,
    formatter: (row) => (row.InvestedAmount === null ? '—' : formatCurrency(row.InvestedAmount))
  },
  {
    key: 'NetGain',
    label: 'Total Gain',
    dataType: 'number',
    isNumeric: true,
    sortable: true,
    formatter: (row) => {
      if (row.NetGain === null) return '—';
      const cls = row.NetGain > 0 ? 'val-positive' : (row.NetGain < 0 ? 'val-negative' : '');
      return `<span class="${cls}">${formatCurrency(row.NetGain)}</span>`;
    }
  },
  {
    key: 'NetGainPct',
    label: 'Total Gain %',
    dataType: 'number',
    isNumeric: true,
    sortable: true,
    formatter: (row) => {
      if (row.NetGainPct === null) return '—';
      const cls = row.NetGainPct > 0 ? 'val-positive' : (row.NetGainPct < 0 ? 'val-negative' : '');
      return `<span class="${cls}">${formatPercent(row.NetGainPct)}</span>`;
    }
  },
  {
    key: 'DrawdownFromATH',
    label: 'ATH Drawdown',
    dataType: 'number',
    isNumeric: true,
    sortable: true,
    formatter: (row) => {
      if (row.DrawdownFromATH === null || row.DrawdownPctFromATH === null) return '—';
      const drawdownRounded = Math.round(row.DrawdownFromATH);
      const drawdownFormatted = drawdownRounded < 0 ? `($${Math.abs(drawdownRounded).toLocaleString()})` : `$${drawdownRounded.toLocaleString()}`;
      const pctFormatted = row.DrawdownPctFromATH !== 0 ? ` (${formatPercent(row.DrawdownPctFromATH)})` : '';
      
      // Build tooltip content
      let tooltip = '';
      if (row.AllTimeHigh !== null) {
        tooltip += `All Time High: ${formatCurrency(row.AllTimeHigh)}`;
        if (row.AllTimeHighDate) {
          const athDate = parseDateForEasternDisplay(row.AllTimeHighDate);
          if (athDate) {
            const athFormatted = new Intl.DateTimeFormat('en-US', {
              timeZone: 'America/New_York',
              year: 'numeric',
              month: 'short',
              day: 'numeric'
            }).format(athDate);
            // Add date on its own line (no "Date:" prefix). Include days-ago in parentheses on same line when available.
            const now = new Date();
            const daysSince = Math.floor((now.getTime() - athDate.getTime()) / (1000 * 60 * 60 * 24));
            if (currentIsLatestPeriod && daysSince > 0) {
              const dayLabel = daysSince === 1 ? '1 day ago' : `${daysSince} days ago`;
              tooltip += `\n${athFormatted} (${dayLabel})\n`;
            } else {
              tooltip += `\n${athFormatted}\n`;
            }
          }
        }
      }
      
      // Add Range Start if set
      if (row.AllTimeHighRangeStart) {
        const rangeStartDate = parseDateForEasternDisplay(row.AllTimeHighRangeStart);
        if (rangeStartDate) {
          const rangeStartFormatted = new Intl.DateTimeFormat('en-US', {
            timeZone: 'America/New_York',
            year: 'numeric',
            month: 'short',
            day: 'numeric'
          }).format(rangeStartDate);
          if (tooltip) tooltip += '\n';
          tooltip += `Range Start: ${rangeStartFormatted}`;
        }
      }
      
      // Always include a help line at the bottom of the ATH tooltip
      if (tooltip) {
        tooltip += '\nClick to set ATH range start.';
      } else {
        tooltip = 'Click to set ATH range start.';
      }
      const tooltipAttr = ` title="${tooltip}"`;
      return `<span${tooltipAttr}>${drawdownFormatted}${pctFormatted}</span>`;
    }
  },
  {
    key: 'TransferAmount',
    label: 'Daily Transfers',
    dataType: 'number',
    isNumeric: true,
    sortable: true,
    formatter: (row) => (row.TransferAmount === null ? '—' : formatCurrency(row.TransferAmount))
  },
  {
    key: 'OrdersExecuted',
    label: 'Orders Placed',
    dataType: 'number',
    isNumeric: true,
    sortable: true,
    formatter: (row) => {
      if (row.OrdersExecuted === null || row.OrdersExecuted === 0) return '—';
      if (!row.PeriodEnd) return String(row.OrdersExecuted);
      const dateOnly = typeof row.PeriodEnd === 'string' && row.PeriodEnd.length >= 10 
        ? row.PeriodEnd.substring(0, 10) 
        : row.PeriodEnd;
      const accountParam = row.AccountID !== null ? `&accountId=${row.AccountID}` : '';
      return `<a href="/orders?executedDate=${encodeURIComponent(dateOnly)}${accountParam}" class="text-decoration-none">${row.OrdersExecuted}</a>`;
    }
  },
  {
    key: 'Comment',
    label: 'Comment',
    dataType: 'string',
    sortable: false,
    formatter: (row) => {
      // Return comment text with edit button in a flex container
      const commentText = row.Comment || '';
      const editIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" class="bi bi-pencil" viewBox="0 0 16 16"><path d="M12.146.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1 0 .708l-10 10a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168l10-10zM11.207 2.5 13.5 4.793 14.793 3.5 12.5 1.207 11.207 2.5zm1.586 3L10.5 3.207 4 9.707V10h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.293l6.5-6.5zm-9.761 5.175-.106.106-1.528 3.821 3.821-1.528.106-.106A.5.5 0 0 1 5 12.5V12h-.5a.5.5 0 0 1-.5-.5V11h-.5a.5.5 0 0 1-.468-.325z"/></svg>`;
      return `<div class="comment-cell-wrapper" data-account-id="${row.AccountID}" style="display: flex; align-items: center; justify-content: space-between; gap: 8px; cursor: pointer;"><span class="comment-text" style="flex: 1; word-wrap: break-word; overflow-wrap: break-word;">${commentText}</span><span class="comment-edit-icon" style="color: #adb5bd; flex-shrink: 0;">${editIcon}</span></div>`;
    }
  },
];

// Split a header label into two lines: first word on top, rest on bottom.
// If the label contains a '%' sign, keep the '%' on the second line.
const splitHeaderLabel = (label: string, sortIndicator: string = ''): string => {
  const hasPct = label.includes('%');
  const clean = label.replace('%', '').trim();
  const words = clean.split(/\s+/).filter(Boolean);
  const top = words.length > 0 ? words[0] : '';
  const bottom = words.length > 1 ? words.slice(1).join(' ') : '';
  const bottomWithPct = hasPct ? (bottom ? `${bottom} %` : '%') : bottom;
  const topWithIndicator = `${top}${sortIndicator}`;
  return bottomWithPct ? `${topWithIndicator}\n${bottomWithPct}` : topWithIndicator;
};

// Access Highcharts from window object (loaded via CDN)
const Highcharts = (window as any).Highcharts;

const renderAccountsPieCharts = (container: HTMLElement, accounts: AccountBalanceRow[]) => {
  if (!Highcharts) {
    console.warn('[accountsClient] Highcharts not available for pie charts');
    return;
  }

  // Animated container for smooth show/hide
  const animatedWrapper = document.createElement('div');
  animatedWrapper.className = 'lumos-accounts-charts-animated';

  const chartsWrapper = document.createElement('div');
  chartsWrapper.className = 'row g-3 mb-3';

  const leftChartCol = document.createElement('div');
  leftChartCol.className = 'col-md-6';
  const leftChartContainer = document.createElement('div');
  leftChartContainer.id = 'accounts-balance-pie-chart';
  leftChartContainer.style.height = '350px';
  leftChartCol.appendChild(leftChartContainer);

  const rightChartCol = document.createElement('div');
  rightChartCol.className = 'col-md-6';
  const rightChartContainer = document.createElement('div');
  rightChartContainer.id = 'accounts-invested-pie-chart';
  rightChartContainer.style.height = '350px';
  rightChartCol.appendChild(rightChartContainer);

  chartsWrapper.appendChild(leftChartCol);
  chartsWrapper.appendChild(rightChartCol);
  animatedWrapper.appendChild(chartsWrapper);
  container.appendChild(animatedWrapper);

  // Prepare data for Balance pie chart
  const balanceData: Array<{ name: string; y: number }> = [];
  accounts.forEach(account => {
    if (account.Balance !== null && account.Balance > 0) {
      balanceData.push({
        name: account.Name,
        y: account.Balance
      });
    }
  });

  // Prepare data for Invested Amount pie chart
  const investedData: Array<{ name: string; y: number }> = [];
  accounts.forEach(account => {
    if (account.InvestedAmount !== null && account.InvestedAmount > 0) {
      investedData.push({
        name: account.Name,
        y: account.InvestedAmount
      });
    }
  });

  // Render Balance pie chart
  Highcharts.chart(leftChartContainer, {
    chart: {
      type: 'pie',
      backgroundColor: 'transparent'
    },
    title: {
      text: 'Current Balance',
      align: 'center',
      style: {
        fontSize: '1.25rem',
        fontWeight: '600',
        color: '#e8e8e8'
      }
    },
    tooltip: {
      pointFormat: '<b>${point.y:,.2f}</b> ({point.percentage:.1f}%)'
    },
    plotOptions: {
      pie: {
        allowPointSelect: true,
        cursor: 'pointer',
        dataLabels: {
          enabled: true,
          format: '<b>{point.name}</b>: ${point.y:,.0f}',
          style: {
            fontSize: '11px',
            color: '#e8e8e8',
            textOutline: '1px #1a1a1a'
          }
        },
        showInLegend: false
      }
    },
    series: [{
      name: 'Balance',
      colorByPoint: true,
      data: balanceData
    }],
    credits: {
      enabled: false
    }
  });

  // Render Invested Amount pie chart
  Highcharts.chart(rightChartContainer, {
    chart: {
      type: 'pie',
      backgroundColor: 'transparent'
    },
    title: {
      text: 'Invested Amount',
      align: 'center',
      style: {
        fontSize: '1.25rem',
        fontWeight: '600',
        color: '#e8e8e8'
      }
    },
    tooltip: {
      pointFormat: '<b>${point.y:,.2f}</b> ({point.percentage:.1f}%)'
    },
    plotOptions: {
      pie: {
        allowPointSelect: true,
        cursor: 'pointer',
        dataLabels: {
          enabled: true,
          format: '<b>{point.name}</b>: ${point.y:,.0f}',
          style: {
            fontSize: '11px',
            color: '#e8e8e8',
            textOutline: '1px #1a1a1a'
          }
        },
        showInLegend: false
      }
    },
    series: [{
      name: 'Invested Amount',
      colorByPoint: true,
      data: investedData
    }],
    credits: {
      enabled: false
    }
  });
};

const renderStatsSection = (container: HTMLElement, accounts: AccountBalanceRow[], asOf: string, rollupPeriod: RollupPeriod) => {
  const statsWrapper = document.createElement('div');
  statsWrapper.className = 'mb-4';
  
  if (accounts.length === 0) {
    const alert = document.createElement('div');
    alert.className = 'alert alert-info mb-3';
    alert.innerHTML = `
      <div class="d-flex align-items-center">
        <div class="me-3" style="font-size: 2rem;">ℹ️</div>
        <div>
          <strong>No accounts to display</strong>
        </div>
      </div>
    `;
    statsWrapper.appendChild(alert);
    container.appendChild(statsWrapper);
    return;
  }
  
  // Calculate stats
  const balanceValues = accounts
    .map(a => a.Balance)
    .filter((b): b is number => b !== null);
  const totalBalance = balanceValues.reduce((sum, val) => sum + val, 0);

  const dailyChangeValues = accounts
    .map(a => a.BalanceChangeAmount)
    .filter((c): c is number => c !== null);
  const totalDailyChange = dailyChangeValues.reduce((sum, val) => sum + val, 0);

  const netGainValues = accounts
    .map(a => a.NetGain)
    .filter((g): g is number => g !== null);
  const totalNetGain = netGainValues.reduce((sum, val) => sum + val, 0);

  const investedValues = accounts
    .map(a => a.InvestedAmount)
    .filter((i): i is number => i !== null);
  const totalInvested = investedValues.reduce((sum, val) => sum + val, 0);

  const isProfitable = totalNetGain > 0;

  // Compute overall balance percent change for the day.
  // We treat the day's percent change as: totalDailyChange / previousTotalBalance,
  // where previousTotalBalance = totalBalance - totalDailyChange (i.e. balance at start of day).
  // If previous total is zero (edge case), we avoid division-by-zero and show '—'.
  let totalBalancePct: number | null = null;
  const prevTotal = totalBalance - totalDailyChange;
  if (prevTotal !== 0) {
    totalBalancePct = totalDailyChange / prevTotal;
  }
  
  // Compute total net gain percent (totalNetGain / totalInvested)
  let totalNetGainPct: number | null = null;
  if (totalInvested !== 0) {
    totalNetGainPct = totalNetGain / totalInvested;
  }

  // Compute ATH drawdown totals
  const athDrawdownValues = accounts
    .map(a => a.DrawdownFromATH)
    .filter((d): d is number => d !== null);
  const totalATHDrawdown = athDrawdownValues.reduce((sum, val) => sum + val, 0);

  const athValues = accounts
    .map(a => a.AllTimeHigh)
    .filter((ath): ath is number => ath !== null);
  const totalATH = athValues.reduce((sum, val) => sum + val, 0);

  let totalATHDrawdownPct: number | null = null;
  if (totalATH !== 0) {
    totalATHDrawdownPct = totalATHDrawdown / totalATH;
  }

  const statsContent = document.createElement('div');
  statsContent.className = 'row g-3';
  const dailyPositive = totalDailyChange > 0;
  const dailyNegative = totalDailyChange < 0;
  const dailyCardStateClass = dailyPositive ? 'success' : (dailyNegative ? 'danger' : '');
  const dailyPctClass = dailyPositive ? 'text-success' : (dailyNegative ? 'text-danger' : '');

  const totalGainPositive = totalNetGain > 0;
  const totalGainNegative = totalNetGain < 0;
  const totalPctClass = totalGainPositive ? 'text-success' : (totalGainNegative ? 'text-danger' : '');

  const periodLabel = getPeriodLabel(rollupPeriod);
  
  statsContent.innerHTML = `
    <div class="col-md-3">
      <div class="card border-0 shadow-sm h-100 stats-card ${dailyCardStateClass ? `stats-card-${dailyCardStateClass}` : ''}">
        <div class="card-body text-center">
          <div class="stats-icon mb-2">📈</div>
          <h6 class="card-subtitle mb-2 text-muted text-uppercase small">${periodLabel} Gain</h6>
          <h3 class="card-title mb-1 fw-bold ${dailyPctClass}">${totalBalancePct !== null ? formatPercent(totalBalancePct) : '—'}</h3>
          <div class="small text-muted">${dailyChangeValues.length > 0 ? formatCurrency(totalDailyChange) : '—'}</div>
        </div>
      </div>
    </div>
    <div class="col-md-3">
      <div class="card border-0 shadow-sm h-100 stats-card stats-card-${isProfitable ? 'success' : 'danger'}">
        <div class="card-body text-center">
          <div class="stats-icon mb-2">${isProfitable ? '💰' : '📉'}</div>
          <h6 class="card-subtitle mb-2 text-muted text-uppercase small">Total Gain</h6>
          <h3 class="card-title mb-1 fw-bold ${totalPctClass}">${totalNetGainPct !== null ? formatPercent(totalNetGainPct) : '—'}</h3>
          <div class="small text-muted">${netGainValues.length > 0 ? formatCurrency(totalNetGain) : '—'}</div>
        </div>
      </div>
    </div>
    <div class="col-md-3">
      <div class="card border-0 shadow-sm h-100 stats-card">
        <div class="card-body text-center">
          <div class="stats-icon mb-2">💵</div>
          <h6 class="card-subtitle mb-2 text-muted text-uppercase small">Total Balance</h6>
          <h3 class="card-title mb-1 fw-bold">${balanceValues.length > 0 ? formatCurrency(totalBalance) : '—'}</h3>
          <div class="small text-muted">Invested: ${investedValues.length > 0 ? formatCurrency(totalInvested) : '—'}</div>
        </div>
      </div>
    </div>
    <div class="col-md-3">
      <div class="card border-0 shadow-sm h-100 stats-card">
        <div class="card-body text-center">
          <div class="stats-icon mb-2">📊</div>
          <h6 class="card-subtitle mb-2 text-muted text-uppercase small">ATH Drawdown</h6>
          <h3 class="card-title mb-1 fw-bold">${totalATHDrawdownPct !== null ? formatPercent(totalATHDrawdownPct) : '—'}</h3>
          <div class="small text-muted">Drawdown: ${athDrawdownValues.length > 0 ? formatCurrency(Math.round(totalATHDrawdown)) : '—'}<br>All Time High: ${athValues.length > 0 ? formatCurrency(totalATH) : '—'}</div>
        </div>
      </div>
    </div>
    
  `;
  
  statsWrapper.appendChild(statsContent);
  container.appendChild(statsWrapper);
};

const renderToolbar = (
  container: HTMLElement,
  onPrevPeriod: () => void,
  onNextPeriod: () => void,
  onLatestPeriod: () => void,
  currentRollupPeriod: RollupPeriod,
  onRollupPeriodChange: (rollupPeriod: RollupPeriod) => void,
  updatesAsOf: string | null
) => {
  const toolbar = document.createElement('div');
  toolbar.className = 'btn-toolbar mb-3 flex-wrap flex-lg-nowrap gap-2 align-items-center';
  toolbar.setAttribute('role', 'toolbar');
  toolbar.setAttribute('aria-label', 'Accounts toolbar');

  const leftGroup = document.createElement('div');
  leftGroup.className = 'btn-group';
  leftGroup.setAttribute('role', 'group');
  leftGroup.setAttribute('aria-label', 'Account actions');

  const refreshBalancesBtn = document.createElement('button');
  refreshBalancesBtn.type = 'button';
  refreshBalancesBtn.id = 'accounts-refresh-balances-btn';
  refreshBalancesBtn.className = 'btn btn-sm btn-outline-secondary';
  // Create "Refresh Balances" button (calls balances-only refresh)
  const refreshOnlyBalancesBtn = document.createElement('button');
  refreshOnlyBalancesBtn.type = 'button';
  refreshOnlyBalancesBtn.id = 'accounts-refresh-only-balances-btn';
  refreshOnlyBalancesBtn.className = 'btn btn-sm btn-outline-secondary';
  refreshOnlyBalancesBtn.title = 'Refresh Balances';
  refreshOnlyBalancesBtn.innerHTML = '<i class="fa-solid fa-arrow-rotate-right" aria-hidden="true"></i> Balances';

  refreshOnlyBalancesBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    const mountPoint = document.querySelector('[data-accounts-table-root]') as HTMLElement | null;
    if (!mountPoint) return;
    let refreshTimer: number | null = window.setTimeout(() => setLoadingState(mountPoint, 'Refreshing Balances...'), 250);
    try {
      const data = await fetchRefreshBalancesData(currentSortState, currentPeriodEnd || undefined, currentRollupPeriod);
      if (refreshTimer) { clearTimeout(refreshTimer); refreshTimer = null; }
      currentSortState = data.sort as SortState;
      currentPeriodEnd = data.periodEnd;
      currentRollupPeriod = data.rollupPeriod;

      // Render table first so the date bar placeholder exists
      renderAccountsTable(mountPoint, data.accounts, data.asOf, currentSortState, handleSort, handlePreviousPeriod, handleNextPeriod, handleLatestPeriod, currentRollupPeriod, handleRollupPeriodChange, data.refreshErrors, data.operationType);
      updateDateDisplay(data.periodStart, data.periodEnd, data.isLatestPeriod, data.rollupPeriod, data.accounts ? data.accounts.length : 0);
      updateNavigationButtons(data.isLatestPeriod);
    } catch (err) {
      console.error('[accountsClient] Refresh balances failed', err);
      if (refreshTimer) { clearTimeout(refreshTimer); refreshTimer = null; }
      if (mountPoint) {
        (window as any).LumosErrorUtils.displayDismissibleError(mountPoint, err instanceof Error ? err.message : String(err), 'Failed to refresh balances');
      }
    }
  });

  refreshBalancesBtn.title = 'Resync Orders';
  refreshBalancesBtn.innerHTML = '<i class="fa-solid fa-arrow-rotate-right" aria-hidden="true"></i> Orders';

  refreshBalancesBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    const mountPoint = document.querySelector('[data-accounts-table-root]') as HTMLElement | null;
    if (!mountPoint) return;
    let refreshTimer: number | null = window.setTimeout(() => setLoadingState(mountPoint, 'Refreshing Orders...'), 250);
    try {
      const data = await fetchRefreshAccountsData(currentSortState, currentPeriodEnd || undefined, currentRollupPeriod);
      if (refreshTimer) { clearTimeout(refreshTimer); refreshTimer = null; }
      currentSortState = data.sort as SortState;
      currentPeriodEnd = data.periodEnd;
      currentRollupPeriod = data.rollupPeriod;
      
      // Render table first so the date bar placeholder exists
      renderAccountsTable(mountPoint, data.accounts, data.asOf, currentSortState, handleSort, handlePreviousPeriod, handleNextPeriod, handleLatestPeriod, currentRollupPeriod, handleRollupPeriodChange, data.refreshErrors, data.operationType);
      updateDateDisplay(data.periodStart, data.periodEnd, data.isLatestPeriod, data.rollupPeriod, data.accounts ? data.accounts.length : 0);
      updateNavigationButtons(data.isLatestPeriod);
    } catch (err) {
      console.error('[accountsClient] Resync orders failed', err);
      if (refreshTimer) { clearTimeout(refreshTimer); refreshTimer = null; }
      if (mountPoint) {
        (window as any).LumosErrorUtils.displayDismissibleError(mountPoint, err instanceof Error ? err.message : String(err), 'Failed to resync orders');
      }
    }
  });

  // Order: Previous/Next/Latest, (gap), Rollup selector, (gap), Resync Brokers

  // Rollup period selector
  const rollupGroup = document.createElement('div');
  rollupGroup.className = 'btn-group ms-2';
  rollupGroup.setAttribute('role', 'group');

  const dailyBtn = document.createElement('button');
  dailyBtn.type = 'button';
  dailyBtn.className = `btn btn-sm btn-outline-secondary${currentRollupPeriod === 1 ? ' active' : ''}`;
  dailyBtn.textContent = 'Daily';
  dailyBtn.addEventListener('click', () => onRollupPeriodChange(1));

  const weeklyBtn = document.createElement('button');
  weeklyBtn.type = 'button';
  weeklyBtn.className = `btn btn-sm btn-outline-secondary${currentRollupPeriod === 2 ? ' active' : ''}`;
  weeklyBtn.textContent = 'Weekly';
  weeklyBtn.addEventListener('click', () => onRollupPeriodChange(2));

  const monthlyBtn = document.createElement('button');
  monthlyBtn.type = 'button';
  monthlyBtn.className = `btn btn-sm btn-outline-secondary${currentRollupPeriod === 3 ? ' active' : ''}`;
  monthlyBtn.textContent = 'Monthly';
  monthlyBtn.addEventListener('click', () => onRollupPeriodChange(3));

  rollupGroup.appendChild(dailyBtn);
  rollupGroup.appendChild(weeklyBtn);
  rollupGroup.appendChild(monthlyBtn);
  // do not append here; we'll place the rollup selector after navigation buttons

  const navGroup = document.createElement('div');
  navGroup.className = 'btn-group';
  navGroup.setAttribute('role', 'group');

  const prevBtn = document.createElement('button');
  prevBtn.type = 'button';
  prevBtn.id = 'accounts-prev-btn';
  prevBtn.className = 'btn btn-sm btn-outline-secondary';
  prevBtn.title = 'Previous period';
  prevBtn.innerHTML = '<i class="fa-solid fa-backward" aria-hidden="true"></i><span class="visually-hidden">Previous</span>';
  prevBtn.addEventListener('click', (e) => { e.preventDefault(); onPrevPeriod(); });

  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.id = 'accounts-next-btn';
  nextBtn.className = 'btn btn-sm btn-outline-secondary';
  nextBtn.title = 'Next period';
  nextBtn.innerHTML = '<i class="fa-solid fa-forward" aria-hidden="true"></i><span class="visually-hidden">Next</span>';
  nextBtn.addEventListener('click', (e) => { e.preventDefault(); onNextPeriod(); });

  const latestBtn = document.createElement('button');
  latestBtn.type = 'button';
  latestBtn.id = 'accounts-latest-btn';
  latestBtn.className = 'btn btn-sm btn-outline-secondary';
  latestBtn.title = 'Latest period';
  latestBtn.innerHTML = '<i class="fa-solid fa-forward-fast" aria-hidden="true"></i><span class="visually-hidden">Latest</span>';
  latestBtn.addEventListener('click', (e) => { e.preventDefault(); onLatestPeriod(); });

  navGroup.appendChild(prevBtn);
  navGroup.appendChild(nextBtn);
  navGroup.appendChild(latestBtn);

  leftGroup.appendChild(navGroup);
  leftGroup.appendChild(rollupGroup);

  // Charts toggle group (to the right of rollup, left of refresh)
  const chartsGroup = document.createElement('div');
  chartsGroup.className = 'btn-group ms-2';
  chartsGroup.setAttribute('role', 'group');

  const chartsToggleBtn = document.createElement('button');
  chartsToggleBtn.type = 'button';
  chartsToggleBtn.className = `btn btn-sm btn-outline-secondary${showCharts ? ' active' : ''}`;
  chartsToggleBtn.textContent = 'Charts';
  chartsToggleBtn.title = 'Show/Hide Pie Charts';
  chartsToggleBtn.setAttribute('aria-pressed', showCharts ? 'true' : 'false');
  chartsToggleBtn.addEventListener('click', () => {
    showCharts = !showCharts;
    chartsToggleBtn.classList.toggle('active', showCharts);
    chartsToggleBtn.setAttribute('aria-pressed', showCharts ? 'true' : 'false');
    // Re-render table to show/hide charts
    const mountPoint = document.querySelector('[data-accounts-table-root]') as HTMLElement | null;
    if (mountPoint) {
      loadAccountsData(currentPeriodEnd || undefined, currentRollupPeriod);
    }
  });
  chartsGroup.appendChild(chartsToggleBtn);
  leftGroup.appendChild(chartsGroup);

  // Separate refresh buttons into their own group for clarity
  const refreshBtnsGroup = document.createElement('div');
  refreshBtnsGroup.className = 'btn-group ms-2';
  refreshBtnsGroup.appendChild(refreshOnlyBalancesBtn);
  refreshBtnsGroup.appendChild(refreshBalancesBtn);
  leftGroup.appendChild(refreshBtnsGroup);

  toolbar.appendChild(leftGroup);

  // Navigation links group (Accounts / History / Trades / Performance / Orders)
  const navLinksGroup = document.createElement('div');
  navLinksGroup.className = 'btn-group ms-auto';
  navLinksGroup.setAttribute('role', 'group');

  const buildNavUrl = (basePath: string): string => {
    const params = new URLSearchParams();
    if (currentBrokerId) params.set('brokerId', String(currentBrokerId));
    const queryString = params.toString();
    return queryString ? `${basePath}?${queryString}` : basePath;
  };

  const navAccountsBtn = document.createElement('button');
  navAccountsBtn.type = 'button';
  navAccountsBtn.className = 'btn btn-sm btn-outline-secondary active';
  navAccountsBtn.disabled = true;
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

  // Update header status message
  const statusEl = document.getElementById('accounts-balances-as-of');
  if (statusEl && updatesAsOf) {
    statusEl.textContent = `Balances as of ${updatesAsOf}`;
  }

  container.appendChild(toolbar);
};



const renderAccountsTable = (
  mountPoint: HTMLElement,
  accounts: AccountBalanceRow[],
  asOf: string,
  sortState: SortState,
  onSort: (key: ColumnKey) => void,
  onPrevPeriod: () => void,
  onNextPeriod: () => void,
  onLatestPeriod: () => void,
  rollupPeriod: RollupPeriod,
  onRollupPeriodChange: (rollupPeriod: RollupPeriod) => void,
  refreshErrors?: string,
  operationType?: string
) => {
  const wrapper = document.createElement('div');
  
  // Display refresh errors at the top if present
  if (refreshErrors) {
    const errorTitle = operationType === 'refresh' ? 'Resync Brokers completed with errors' : 'Refresh Balances completed with errors';
    (window as any).LumosErrorUtils.displayDismissibleError(wrapper, refreshErrors, errorTitle);
  }
  
  // Create date bar placeholder (will be populated by updateDateDisplay)
  const dateBarPlaceholder = document.createElement('div');
  dateBarPlaceholder.setAttribute('data-accounts-date-display', '');
  wrapper.appendChild(dateBarPlaceholder);

  // Render stats section
  renderStatsSection(wrapper, accounts, asOf, rollupPeriod);
  
  // Render pie charts with animation
  let chartsAnimated: HTMLElement | null = null;
  if (showCharts) {
    renderAccountsPieCharts(wrapper, accounts);
    chartsAnimated = wrapper.querySelector('.lumos-accounts-charts-animated');
    if (chartsAnimated) {
      chartsAnimated.style.overflow = 'hidden';
      chartsAnimated.style.display = '';
      chartsAnimated.style.opacity = '0';
      chartsAnimated.style.maxHeight = '0px';
      chartsAnimated.style.transition = 'max-height 0.4s cubic-bezier(0.4,0,0.2,1), opacity 0.3s';
      // Two animation frames: first set to 0, then expand to scrollHeight
      requestAnimationFrame(() => {
        if (chartsAnimated) {
          chartsAnimated.style.opacity = '1';
          chartsAnimated.style.maxHeight = chartsAnimated.scrollHeight + 'px';
        }
      });
    }
  } else {
    chartsAnimated = wrapper.querySelector('.lumos-accounts-charts-animated');
    if (chartsAnimated) {
      // Force reflow to ensure transition starts from current state
      chartsAnimated.style.maxHeight = chartsAnimated.scrollHeight + 'px';
      chartsAnimated.style.opacity = '1';
      // Next frame, collapse
      requestAnimationFrame(() => {
        if (chartsAnimated) {
          chartsAnimated.style.maxHeight = '0px';
          chartsAnimated.style.opacity = '0';
        }
      });
      // Remove after transition ends
      const removeAfterTransition = (e: TransitionEvent) => {
        if (e.propertyName === 'max-height' && chartsAnimated) {
          chartsAnimated.removeEventListener('transitionend', removeAfterTransition);
          chartsAnimated.remove();
        }
      };
      chartsAnimated.addEventListener('transitionend', removeAfterTransition);
    }
  }
  
  // Render toolbar (include latest BalanceUpdateTime if available)
  let updatesAsOfRendered: string | null = null;
  const updateTimes = accounts
    .map(a => a.BalanceUpdateTime)
    .filter((t): t is string => t !== null && t !== undefined)
    .map(t => new Date(t))
    .filter(d => !isNaN(d.getTime()));
  if (updateTimes.length > 0) {
    const maxMs = Math.max(...updateTimes.map(d => d.getTime()));
    updatesAsOfRendered = dateFormatter.format(new Date(maxMs));
  }

  // Inject bookmark bar (if available)
  const bookmarkContainer = document.createElement('div');
  wrapper.appendChild(bookmarkContainer);
  const renderAccountsBookmark = (window as any).__renderAccountsBookmarkBar as ((c: HTMLElement) => void) | undefined;
  if (renderAccountsBookmark) {
    renderAccountsBookmark(bookmarkContainer);
  }
  
  // Render toolbar
  renderToolbar(wrapper, onPrevPeriod, onNextPeriod, onLatestPeriod, rollupPeriod, onRollupPeriodChange, updatesAsOfRendered);
  
  if (accounts.length === 0) {
    mountPoint.replaceChildren(wrapper);
    return;
  }
  
  const table = document.createElement('table');
  table.className = 'table table-hover table-sm align-middle';
  table.style.fontSize = '0.875rem';
  
  // Header
  const thead = document.createElement('thead');
  thead.className = 'table-light sticky-top';
  const headerRow = document.createElement('tr');
  // Filter row (will contain dropdowns / filter controls)
  const filterRow = document.createElement('tr');

  // Determine whether to show the Daily Transfers column. Show it only
  // when at least one account row has a non-null TransferAmount.
  const showDailyTransfers = accounts.some(a => a.TransferAmount !== null && a.TransferAmount !== undefined);

  const columns = getColumns(rollupPeriod);
  const visibleColumns = columns.filter((col) => {
    if (col.key === 'TransferAmount') return showDailyTransfers;
    return true;
  });

  visibleColumns.forEach((col) => {
    const th = document.createElement('th');
    th.scope = 'col';

    if (col.isNumeric) {
      th.className = 'text-center';
    }

    // Always allow multi-line header rendering
    th.style.whiteSpace = 'pre-line';
    // Adjust column widths for compactness or emphasis
    if (col.key === 'Name') {
      th.style.minWidth = '120px';
      th.style.maxWidth = '260px';
    }
    if (col.key === 'BalanceChangeAmount' || col.key === 'BalanceChangePct' || col.key === 'InvestedAmount' || col.key === 'NetGain' || col.key === 'NetGainPct') {
      th.style.minWidth = '100px';
      th.style.maxWidth = '140px';
    }
    if (col.key === 'Comment') {
      th.style.minWidth = '260px';
      th.style.maxWidth = '600px';
    }

    const sortIndicator = col.sortable !== false && sortState.key === col.key
      ? (sortState.direction === 'asc' ? ' ▲' : ' ▼')
      : '';

    const dynamicLabel = getColumnLabel(col.key, rollupPeriod);
    const headerText = splitHeaderLabel(col.label, sortIndicator);

    th.textContent = headerText;

    if (col.sortable !== false) {
      th.style.cursor = 'pointer';
      th.style.userSelect = 'none';
      th.addEventListener('click', () => onSort(col.key));
      th.title = `Sort by ${dynamicLabel}`;
    } else {
      th.title = dynamicLabel;
    }

    headerRow.appendChild(th);
    // Create corresponding filter cell (empty by default)
    const filterTh = document.createElement('th');
    filterTh.scope = 'col';
    filterTh.style.paddingTop = '0.25rem';
    filterTh.style.paddingBottom = '0.25rem';
    // If this is BrokerName column, render the broker select
    if (col.key === 'BrokerName') {
      const select = document.createElement('select');
      select.className = 'form-select form-select-sm';
      select.style.minWidth = '140px';
      const allOption = document.createElement('option');
      allOption.value = '';
      allOption.text = 'All';
      select.appendChild(allOption);
      // Populate from last-loaded brokers list (sorted alphabetically)
      const brokers = (window as any).lumosAccountsBrokers as Array<{ BrokerID: number; Name: string }> | undefined;
      if (brokers && brokers.length > 0) {
        const sortedBrokers = [...brokers].sort((a, b) => a.Name.localeCompare(b.Name));
        sortedBrokers.forEach(b => {
          const opt = document.createElement('option');
          opt.value = String(b.BrokerID);
          opt.text = b.Name;
          select.appendChild(opt);
        });
      }
      // Set current value from cookie/state
      if (currentBrokerId) select.value = String(currentBrokerId);
      select.addEventListener('change', () => {
        const v = select.value;
        currentBrokerId = v ? Number(v) : null;
        // Reload
        loadAccountsData(currentPeriodEnd || undefined, currentRollupPeriod);
      });
      filterTh.appendChild(select);
    }

    filterRow.appendChild(filterTh);
  });
  
  thead.appendChild(headerRow);
  thead.appendChild(filterRow);
  table.appendChild(thead);
  
  // Body
  const tbody = document.createElement('tbody');

  accounts.forEach((account) => {
    const row = document.createElement('tr');

    visibleColumns.forEach((col) => {
      const td = document.createElement('td');
      
      if (col.isNumeric) {
        td.className = 'text-center';
      }
      // Apply matching width constraints to body cells to keep columns consistent
      if (col.key === 'Name') {
        td.style.minWidth = '120px';
        td.style.maxWidth = '260px';
      }
      if (col.key === 'BalanceChangeAmount' || col.key === 'BalanceChangePct' || col.key === 'InvestedAmount' || col.key === 'NetGain' || col.key === 'NetGainPct') {
        td.style.minWidth = '100px';
        td.style.maxWidth = '140px';
      }
      if (col.key === 'Comment') {
        td.style.minWidth = '260px';
        td.style.maxWidth = '600px';
        td.style.padding = '10px 8px'; // Preserve default padding
      }
      
      // Make ATH Drawdown cell clickable
      if (col.key === 'DrawdownFromATH') {
        td.style.cursor = 'pointer';
        td.setAttribute('data-ath-config-cell', 'true');
        td.setAttribute('data-account-id', String(account.AccountID || ''));
        td.setAttribute('data-account-name', account.Name || '');
      }
      
      const raw = col.formatter ? col.formatter(account) : String(account[col.key] ?? '');

      // Handle Daily Transfers with tooltip
      if (col.key === 'TransferAmount' && account.TransferDescription) {
        td.textContent = raw;
        td.title = account.TransferDescription;
        td.style.cursor = 'help';
      } else {
        // If formatter returned HTML (e.g., colored span), insert as HTML
        const hasHtml = /<\/?[a-z][\s\S]*>/i.test(raw);
        if (hasHtml) {
          td.innerHTML = raw;
        } else {
          td.textContent = raw;
        }
      }

      // Preserve whitespace for formatted values
      if (raw.includes('\n')) {
        td.style.whiteSpace = 'pre-line';
      }
      
      row.appendChild(td);
    });
    
    tbody.appendChild(row);
  });
  
  table.appendChild(tbody);
  wrapper.appendChild(table);
  
  ensureRenderRowCount(wrapper, accounts.length);
  mountPoint.replaceChildren(wrapper);
  
  // Attach comment edit handlers and ATH config handlers after table is rendered
  attachCommentEditHandlers(mountPoint);
  attachAthConfigHandlers(mountPoint);
};

// Inline comment editing functionality
const attachCommentEditHandlers = (container: HTMLElement) => {
  const commentWrappers = container.querySelectorAll('.comment-cell-wrapper');
  
  commentWrappers.forEach(wrapper => {
    wrapper.addEventListener('click', (e) => {
      e.preventDefault();
      const wrapperEl = e.currentTarget as HTMLElement;
      const accountId = parseInt(wrapperEl.getAttribute('data-account-id') || '0', 10);
      
      if (!accountId) return;
      
      const td = wrapperEl.closest('td');
      if (!td) return;
      
      // Get current comment text
      const commentSpan = td.querySelector('.comment-text');
      const currentComment = commentSpan?.textContent || '';
      
      // Replace cell content with edit UI
      td.innerHTML = `
        <div class="d-flex align-items-center gap-2">
          <input type="text" class="form-control form-control-sm comment-input" value="${currentComment.replace(/"/g, '&quot;')}" style="flex: 1;" />
          <button class="btn btn-success btn-sm comment-save-btn" title="Save">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" class="bi bi-check-lg" viewBox="0 0 16 16"><path d="M12.736 3.97a.733.733 0 0 1 1.047 0c.286.289.29.756.01 1.05L7.88 12.01a.733.733 0 0 1-1.065.02L3.217 8.384a.757.757 0 0 1 0-1.06.733.733 0 0 1 1.047 0l3.052 3.093 5.4-6.425a.247.247 0 0 1 .02-.022Z"/></svg>
          </button>
          <button class="btn btn-secondary btn-sm comment-cancel-btn" title="Cancel">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" class="bi bi-x-lg" viewBox="0 0 16 16"><path d="M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8 2.146 2.854Z"/></svg>
          </button>
        </div>
      `;
      
      const input = td.querySelector('.comment-input') as HTMLInputElement;
      const saveBtn = td.querySelector('.comment-save-btn');
      const cancelBtn = td.querySelector('.comment-cancel-btn');
      
      // Focus the input
      input?.focus();
      input?.select();
      
      // Cancel handler
      const handleCancel = () => {
        const editIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" class="bi bi-pencil" viewBox="0 0 16 16"><path d="M12.146.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1 0 .708l-10 10a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168l10-10zM11.207 2.5 13.5 4.793 14.793 3.5 12.5 1.207 11.207 2.5zm1.586 3L10.5 3.207 4 9.707V10h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.293l6.5-6.5zm-9.761 5.175-.106.106-1.528 3.821 3.821-1.528.106-.106A.5.5 0 0 1 5 12.5V12h-.5a.5.5 0 0 1-.5-.5V11h-.5a.5.5 0 0 1-.468-.325z"/></svg>`;
        td.innerHTML = `<div class="comment-cell-wrapper" data-account-id="${accountId}" style="display: flex; align-items: center; justify-content: space-between; gap: 8px; cursor: pointer;"><span class="comment-text" style="flex: 1; word-wrap: break-word; overflow-wrap: break-word;">${currentComment}</span><span class="comment-edit-icon" style="color: #adb5bd; flex-shrink: 0;">${editIcon}</span></div>`;
        attachCommentEditHandlers(container);
        attachAthConfigHandlers(container);
      };
      
      // Save handler
      const handleSave = async () => {
        const newComment = input?.value || '';
        
        // Disable buttons during save
        if (saveBtn) (saveBtn as HTMLButtonElement).disabled = true;
        if (cancelBtn) (cancelBtn as HTMLButtonElement).disabled = true;
        if (input) input.disabled = true;
        
        try {
          const response = await fetch(REQUEST_ENDPOINT, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              accountId,
              comment: newComment,
              periodEnd: currentPeriodEnd || null,
              rollupPeriod: currentRollupPeriod
            })
          });
          
          if (!response.ok) {
            throw new Error(`Failed to save comment: ${response.statusText}`);
          }
          
          // Refresh the table to show updated data
          const mountPoint = document.querySelector('[data-accounts-table-root]') as HTMLElement;
          if (mountPoint) {
            const data = await fetchAccountsData(currentSortState, currentPeriodEnd || undefined, currentRollupPeriod);
            
            // Compute updatesAsOfRendered
            let updatesAsOfRendered: string | null = null;
            const updateTimes = data.accounts
              .map(a => a.BalanceUpdateTime)
              .filter((t): t is string => t !== null && t !== undefined)
              .map(t => new Date(t))
              .filter(d => !isNaN(d.getTime()));
            if (updateTimes.length > 0) {
              const maxMs = Math.max(...updateTimes.map(d => d.getTime()));
              updatesAsOfRendered = dateFormatter.format(new Date(maxMs));
            }
            
            renderAccountsTable(mountPoint, data.accounts, data.asOf, currentSortState, handleSort, handlePreviousPeriod, handleNextPeriod, handleLatestPeriod, currentRollupPeriod, handleRollupPeriodChange, undefined);
            updateDateDisplay(data.periodStart, data.periodEnd, data.isLatestPeriod, data.rollupPeriod, data.accounts ? data.accounts.length : 0);
            updateNavigationButtons(data.isLatestPeriod);
          }
        } catch (err) {
          console.error('[accountsClient] Failed to save comment:', err);
          alert(`Failed to save comment: ${err instanceof Error ? err.message : String(err)}`);
          handleCancel();
        }
      };
      
      // Attach event listeners
      cancelBtn?.addEventListener('click', handleCancel);
      saveBtn?.addEventListener('click', handleSave);
      
      // Handle Enter key to save, Escape to cancel
      input?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleSave();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          handleCancel();
        }
      });
    });
  });
};

// ATH Range Start modal functionality
const attachAthConfigHandlers = (container: HTMLElement) => {
  const athCells = container.querySelectorAll('[data-ath-config-cell]');
  
  athCells.forEach(cell => {
    cell.addEventListener('click', (e) => {
      e.preventDefault();
      const cellEl = e.currentTarget as HTMLElement;
      const accountId = parseInt(cellEl.getAttribute('data-account-id') || '0', 10);
      const accountName = cellEl.getAttribute('data-account-name') || '';
      
      if (!accountId) return;
      
      // Find the current account data to check for existing AllTimeHighRangeStart
      const currentAccount = lastLoadedAccounts?.find(a => a.AccountID === accountId);
      
      // Show modal
      showAthModal(accountId, accountName, currentAccount);
    });
  });
};

const showAthModal = (accountId: number, accountName: string, accountData?: AccountBalanceRow) => {
  const modal = document.getElementById('athRangeStartModal');
  if (!modal) return;
  
  // Set account info text
  const accountInfo = document.getElementById('ath-modal-account-info');
  if (accountInfo) {
    accountInfo.innerHTML = `Configure the All Time High calculation range start for account <i>${accountName}</i>.`;
  }
  
  // Show current range start if exists (we'd need to add this to the response - for now, we'll skip this part)
  const currentRangeEl = document.getElementById('ath-modal-current-range');
  if (currentRangeEl) {
    currentRangeEl.textContent = ''; // Could show "Current range start: <date>" if we had that data
  }
  
  // Configure radio/date behavior
  const clearRadio = document.getElementById('ath-choice-clear') as HTMLInputElement | null;
  const dateRadio = document.getElementById('ath-choice-date') as HTMLInputElement | null;
  const dateInput = document.getElementById('ath-range-date-input') as HTMLInputElement | null;

  if (clearRadio && dateRadio && dateInput) {
    // Default state
    clearRadio.checked = true;
    dateInput.value = '';
    dateInput.disabled = true;

    // If account already has a range start, prefill it
    if (accountData && accountData.AllTimeHighRangeStart) {
      const existing = (accountData.AllTimeHighRangeStart.split && accountData.AllTimeHighRangeStart.split('T')[0]) || accountData.AllTimeHighRangeStart;
      dateInput.value = existing;
      dateInput.disabled = false;
      dateRadio.checked = true;
      clearRadio.checked = false;

      const currentRangeEl = document.getElementById('ath-modal-current-range');
      if (currentRangeEl) currentRangeEl.textContent = `Current range start: ${existing}`;
    }

    // Toggle date input when user changes choice
    clearRadio.addEventListener('change', () => {
      if (clearRadio.checked) dateInput.disabled = true;
    });
    dateRadio.addEventListener('change', () => {
      if (dateRadio.checked) dateInput.disabled = false;
    });
  }

  // Setup OK button handler
  const okBtn = document.getElementById('ath-modal-ok-btn');
  if (okBtn) {
    // Remove any existing event listeners by cloning the button
    const newOkBtn = okBtn.cloneNode(true) as HTMLElement;
    okBtn.parentNode?.replaceChild(newOkBtn, okBtn);

    newOkBtn.addEventListener('click', async () => {
      const useClear = (document.getElementById('ath-choice-clear') as HTMLInputElement)?.checked;
      const useDate = (document.getElementById('ath-choice-date') as HTMLInputElement)?.checked;
      const pickedDate = (document.getElementById('ath-range-date-input') as HTMLInputElement)?.value;

      // Validate date selection if chosen
      if (useDate && (!pickedDate || pickedDate.trim() === '')) {
        alert('Please choose a date or select Clear Range Start.');
        return;
      }

      const payloadDate = useClear ? null : (pickedDate || null);

      try {
        // Disable button during save
        (newOkBtn as HTMLButtonElement).disabled = true;

        const response = await fetch(REQUEST_ENDPOINT, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            accountId,
            athRangeStart: payloadDate
          })
        });

        if (!response.ok) {
          throw new Error(`Failed to update ATH range start: ${response.statusText}`);
        }

        // Close modal
        const bootstrapModal = (window as any).bootstrap?.Modal.getOrCreateInstance(modal);
        bootstrapModal?.hide();

        // Refresh the accounts data to show updated ATH values
        loadAccountsData(currentPeriodEnd || undefined, currentRollupPeriod);

      } catch (err) {
        console.error('[accountsClient] Failed to update ATH range start:', err);

        // Show error modal
        const errorModal = document.getElementById('accountsErrorModal');
        const errorMessage = document.getElementById('accounts-error-message');
        if (errorModal && errorMessage && (window as any).bootstrap) {
          errorMessage.textContent = `Failed to update ATH range start: ${err instanceof Error ? err.message : String(err)}`;
          const bsErrorModal = (window as any).bootstrap.Modal.getOrCreateInstance(errorModal);
          bsErrorModal.show();
        } else {
          alert(`Failed to update ATH range start: ${err instanceof Error ? err.message : String(err)}`);
        }
      } finally {
        (newOkBtn as HTMLButtonElement).disabled = false;
      }
    });
  }

  // Show the modal
  const bootstrapModal = (window as any).bootstrap?.Modal.getOrCreateInstance(modal);
  bootstrapModal?.show();
};

// State management
let currentSortState: SortState = DEFAULT_SORT;
let currentPeriodEnd: string | null = null;
let currentRollupPeriod: RollupPeriod = DEFAULT_ROLLUP_PERIOD;
// Indicates whether the currently displayed period is the latest available period
let currentIsLatestPeriod: boolean = true;
let currentBrokerId: number | null = null;
let lastLoadedAccounts: AccountBalanceRow[] | null = null;

const fetchAccountsData = async (
  sortState: SortState,
  periodEnd?: string,
  rollupPeriod: RollupPeriod = 1,
  operation?: 'previous' | 'next'
): Promise<AccountsApiResponse> => {
  const params = new URLSearchParams();
  // Map client column key to server-side sort column where necessary
  const sortKeyForServer = sortState.key === 'BrokerName' ? 'Broker' : String(sortState.key);
  params.set('sortKey', sortKeyForServer);
  params.set('sortDirection', sortState.direction);
  if (periodEnd) {
    params.set('periodEnd', periodEnd);
  }
  params.set('rollupPeriod', String(rollupPeriod));
  if (currentBrokerId) params.set('brokerId', String(currentBrokerId));
  
  if (operation) {
    params.set('op', operation);
  }
  
  const response = await fetch(`${REQUEST_ENDPOINT}?${params.toString()}`);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch accounts: ${response.statusText}`);
  }
  
  return response.json();
};

const fetchRefreshAccountsData = async (
  sortState: SortState,
  periodEnd?: string,
  rollupPeriod: RollupPeriod = 1
): Promise<AccountsApiResponse> => {
  const params = new URLSearchParams();
  // Map client column key to server-side sort column where necessary
  const sortKeyForServer = sortState.key === 'BrokerName' ? 'Broker' : String(sortState.key);
  params.set('sortKey', sortKeyForServer);
  params.set('sortDirection', sortState.direction);
  params.set('op', 'refresh');
  if (periodEnd) {
    params.set('periodEnd', periodEnd);
  }
  params.set('rollupPeriod', String(rollupPeriod));
  if (currentBrokerId) params.set('brokerId', String(currentBrokerId));

  const response = await fetch(`${REQUEST_ENDPOINT}?${params.toString()}`, {
    method: 'GET',
    headers: { Accept: 'application/json' }
  });

  if (!response.ok) {
    throw new Error(`Failed to refresh accounts: ${response.statusText}`);
  }

  return response.json();
};

const fetchRefreshBalancesData = async (
  sortState: SortState,
  periodEnd?: string,
  rollupPeriod: RollupPeriod = 1
): Promise<AccountsApiResponse> => {
  const params = new URLSearchParams();
  // Map client column key to server-side sort column where necessary
  const sortKeyForServer = sortState.key === 'BrokerName' ? 'Broker' : String(sortState.key);
  params.set('sortKey', sortKeyForServer);
  params.set('sortDirection', sortState.direction);
  params.set('op', 'refreshBalances');
  if (periodEnd) {
    params.set('periodEnd', periodEnd);
  }
  params.set('rollupPeriod', String(rollupPeriod));
  if (currentBrokerId) params.set('brokerId', String(currentBrokerId));

  const response = await fetch(`${REQUEST_ENDPOINT}?${params.toString()}`, {
    method: 'GET',
    headers: { Accept: 'application/json' }
  });

  if (!response.ok) {
    throw new Error(`Failed to refresh balances: ${response.statusText}`);
  }

  return response.json();
};

const handleSort = (key: ColumnKey) => {
  if (accountsBookmarkBar) accountsBookmarkBar.clearSelection();
  if (currentSortState.key === key) {
    currentSortState.direction = currentSortState.direction === 'asc' ? 'desc' : 'asc';
  } else {
    currentSortState.key = key;
    currentSortState.direction = 'asc';
  }
  
  loadAccountsData(currentPeriodEnd || undefined, currentRollupPeriod);
};

const handleReset = () => {
  currentSortState = { ...DEFAULT_SORT };
  currentPeriodEnd = null;
  currentRollupPeriod = DEFAULT_ROLLUP_PERIOD;
  currentBrokerId = null;
  showCharts = false;
  loadAccountsData();
};

const handlePreviousPeriod = () => {
  if (accountsBookmarkBar) accountsBookmarkBar.clearSelection();
  if (!currentPeriodEnd) {
    loadAccountsData(undefined, currentRollupPeriod);
    return;
  }
  
  loadAccountsData(currentPeriodEnd, currentRollupPeriod, 'previous');
};

const handleNextPeriod = () => {
  if (accountsBookmarkBar) accountsBookmarkBar.clearSelection();
  if (!currentPeriodEnd) {
    loadAccountsData(undefined, currentRollupPeriod);
    return;
  }
  
  loadAccountsData(currentPeriodEnd, currentRollupPeriod, 'next');
};

const handleLatestPeriod = () => {
  if (accountsBookmarkBar) accountsBookmarkBar.clearSelection();
  currentPeriodEnd = null;
  loadAccountsData(undefined, currentRollupPeriod);
};

const handleRollupPeriodChange = (rollupPeriod: RollupPeriod) => {
  if (accountsBookmarkBar) accountsBookmarkBar.clearSelection();
  currentRollupPeriod = rollupPeriod;
  currentPeriodEnd = null;
  loadAccountsData(undefined, currentRollupPeriod);
};

const formatElapsed = (pastDate: Date, today: Date = new Date()): string => {
  // compute whole-day difference
  // Use UTC components to avoid timezone issues
  const utc1 = Date.UTC(pastDate.getUTCFullYear(), pastDate.getUTCMonth(), pastDate.getUTCDate());
  
  // For "today", we need to get the ET date components and treat them as UTC
  const todayParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: 'numeric', day: 'numeric'
  }).formatToParts(today);
  const get = (type: string) => parseInt(todayParts.find(p => p.type === type)!.value, 10);
  const utc2 = Date.UTC(get('year'), get('month') - 1, get('day'));
  
  let days = Math.floor((utc2 - utc1) / (1000 * 60 * 60 * 24));

  if (days <= 1) {
    return `${days} day${days === 1 ? '' : 's'} ago`;
  }

  if (days <= 14) {
    return `${days} days ago`;
  }

  // weeks and days
  if (days <= 60) {
    const weeks = Math.floor(days / 7);
    const rem = days % 7;
    const resultParts = [] as string[];
    if (weeks > 0) resultParts.push(`${weeks} week${weeks === 1 ? '' : 's'}`);
    if (rem > 0) resultParts.push(`${rem} day${rem === 1 ? '' : 's'}`);
    return `${resultParts.join(', ')} ago`;
  }

  // months (approx 30 days), weeks, days
  if (days <= 365) {
    const months = Math.floor(days / 30);
    let rem = days - months * 30;
    const weeks = Math.floor(rem / 7);
    rem = rem % 7;
    const resultParts = [] as string[];
    if (months > 0) resultParts.push(`${months} month${months === 1 ? '' : 's'}`);
    if (weeks > 0) resultParts.push(`${weeks} week${weeks === 1 ? '' : 's'}`);
    if (rem > 0) resultParts.push(`${rem} day${rem === 1 ? '' : 's'}`);
    return `${resultParts.join(', ')} ago`;
  }

  // years, months, weeks
  const years = Math.floor(days / 365);
  let rem = days - years * 365;
  const months = Math.floor(rem / 30);
  rem = rem - months * 30;
  const weeks = Math.floor(rem / 7);
  const resultParts = [] as string[];
  if (years > 0) resultParts.push(`${years} year${years === 1 ? '' : 's'}`);
  if (months > 0) resultParts.push(`${months} month${months === 1 ? '' : 's'}`);
  if (weeks > 0) resultParts.push(`${weeks} week${weeks === 1 ? '' : 's'}`);
  return `${resultParts.join(', ')} ago`;
};

const updateDateDisplay = (
  periodStart: string,
  periodEnd: string,
  isLatestPeriod: boolean,
  rollupPeriod: RollupPeriod,
  accountCount: number | null = null
) => {
  const root = document.querySelector('[data-accounts-table-root]') as HTMLElement | null;
  if (!root) return;

  let dateDisplay = root.querySelector('[data-accounts-date-display]') as HTMLElement | null;
  if (!dateDisplay) {
    // Create placeholder at the top of the accounts table root so it spans full width
    dateDisplay = document.createElement('div');
    dateDisplay.setAttribute('data-accounts-date-display', '');
    // Insert at the top
    root.insertBefore(dateDisplay, root.firstChild);
  }

  // Format date range based on rollup period
  let dateText: string;
  const endDate = new Date(periodEnd + 'T12:00:00');
  const startDate = new Date(periodStart + 'T12:00:00');
  
  if (rollupPeriod === 1) { // Daily
    dateText = endDate.toLocaleDateString('en-US', {
      timeZone: 'America/New_York',
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  } else if (rollupPeriod === 2) { // Weekly
    const weekEnd = endDate.toLocaleDateString('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
    dateText = `Week ending ${weekEnd}`;
  } else { // Monthly
    dateText = endDate.toLocaleDateString('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: 'long'
    });
  }

  // Render a full-width bar with LATEST badge (if latest) and account count right-justified
  if (isLatestPeriod) {
    const latestClass = 'bg-success text-white';
    const latestBadge = ' <span class="badge bg-light text-success ms-2">LATEST</span>';
    const leftHtml = `<div class="text-start"><strong>${dateText}</strong>${latestBadge}</div>`;
    const count = accountCount !== null ? accountCount : 0;
    const rightClass = 'text-end text-white small';
    const rightHtml = `<div class="${rightClass}">${count} ${count === 1 ? 'account' : 'accounts'}</div>`;
    dateDisplay.className = `mb-3 d-flex justify-content-between align-items-center ${latestClass} rounded px-3 py-2`;
    dateDisplay.innerHTML = leftHtml + rightHtml;
  } else {
    const relative = formatElapsed(endDate, new Date());
    // Non-latest: show a subtle light bar with muted text and right-justified count
    const leftHtml = `<div class="text-start"><strong>${dateText}</strong></div>`;
    const count = accountCount !== null ? accountCount : 0;
    const rightClass = 'text-end text-muted small';
    const rightHtml = `<div class="${rightClass}">${count} ${count === 1 ? 'account' : 'accounts'}</div>`;
    dateDisplay.className = 'mb-3 d-flex justify-content-between align-items-center bg-light text-dark rounded px-3 py-2';
    dateDisplay.innerHTML = leftHtml + rightHtml;
  }
};

const updateNavigationButtons = (isLatestPeriod: boolean) => {
  const nextBtn = document.getElementById('accounts-next-btn') as HTMLButtonElement;
  if (nextBtn) {
    nextBtn.disabled = isLatestPeriod;
  }
};

const setLoadingState = (mountPoint: HTMLElement, message: string = 'Loading accounts...') => {
  mountPoint.innerHTML = `
    <div class="text-center py-5">
      <div class="spinner-border spinner-border-sm text-secondary me-2" role="status"></div>
      <span class="fs-5 text-muted align-middle">${message}</span>
    </div>
  `;
};

const loadAccountsData = async (periodEnd?: string, rollupPeriod?: RollupPeriod, operation?: 'previous' | 'next') => {
  const mountPoint = document.querySelector('[data-accounts-table-root]') as HTMLElement;
  if (!mountPoint) {
    console.error('[accountsClient] Mount point not found');
    return;
  }
  // Show a loading indicator only if the request takes longer than 250ms
  let loadingTimer: number | null = window.setTimeout(() => setLoadingState(mountPoint), 250);

  try {
    const effectiveRollup = (typeof rollupPeriod !== 'undefined' && rollupPeriod !== null) ? rollupPeriod : currentRollupPeriod;
    const data = await fetchAccountsData(currentSortState, periodEnd, effectiveRollup, operation);
    // Map server sort key back to client key
    const serverKey = String(data.sort.key);
    const sortKey = serverKey === 'Broker' ? 'BrokerName' : serverKey;
    currentSortState = { key: sortKey as ColumnKey, direction: data.sort.direction as SortDirection };
    currentPeriodEnd = data.periodEnd;
    currentRollupPeriod = data.rollupPeriod;
    // Keep track of whether the server considers this the latest period
    currentIsLatestPeriod = !!data.isLatestPeriod;
    
    // Store accounts data for modal access
    lastLoadedAccounts = data.accounts;

    // Render table first so date bar placeholder exists
    renderAccountsTable(
      mountPoint,
      data.accounts,
      data.asOf,
      currentSortState,
      handleSort,
      handlePreviousPeriod,
      handleNextPeriod,
      handleLatestPeriod,
      currentRollupPeriod,
      handleRollupPeriodChange,
      data.refreshErrors,
      data.operationType
    );
    
    // Update date display and navigation buttons
    updateDateDisplay(data.periodStart, data.periodEnd, data.isLatestPeriod, data.rollupPeriod, data.accounts ? data.accounts.length : 0);
    updateNavigationButtons(data.isLatestPeriod);

    if (loadingTimer) { clearTimeout(loadingTimer); loadingTimer = null; }
  } catch (error) {
    console.error('[accountsClient] Error loading accounts:', error);
    if (loadingTimer) { clearTimeout(loadingTimer); loadingTimer = null; }
    mountPoint.innerHTML = `
      <div class="alert alert-danger">
        <strong>Error loading accounts:</strong> ${error instanceof Error ? error.message : 'Unknown error'}
      </div>
    `;
  }
};

// Bookmark bar integration (uses reusable client-side BookmarkBar)
const accountsBookmarkBar = (window as any).BookmarkBar ? new (window as any).BookmarkBar(
  'AccountsViewState',
  (savedState: any) => {
    // Apply saved state into local state then reload
    currentSortState = savedState.sort || currentSortState;
    // Support both numeric (1/2/3) and string ('daily'/'weekly'/'monthly') rollup values
    const savedRp = savedState.rollupPeriod;
    if (typeof savedRp === 'string') {
      currentRollupPeriod = savedRp === 'weekly' ? 2 : (savedRp === 'monthly' ? 3 : 1);
    } else {
      currentRollupPeriod = savedRp || currentRollupPeriod;
    }
    currentBrokerId = typeof savedState.brokerId !== 'undefined' ? savedState.brokerId : currentBrokerId;
    showCharts = typeof savedState.showCharts !== 'undefined' ? savedState.showCharts : false;
    loadAccountsData();
  },
  () => {
    return {
      sort: currentSortState,
      rollupPeriod: currentRollupPeriod,
      brokerId: currentBrokerId,
      showCharts: showCharts
    };
  },
  handleReset,
  (window as any).LUMOS_DEMO_MODE || false
) : null;

// Expose a small renderer function so the renderAccountsTable can call into this closure
(window as any).__renderAccountsBookmarkBar = (container: HTMLElement) => {
  if (accountsBookmarkBar) accountsBookmarkBar.render(container);
};

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  // Initialize with defaults
  currentSortState = DEFAULT_SORT;
  currentRollupPeriod = DEFAULT_ROLLUP_PERIOD;
  
  // Check if there's a periodEnd in the URL query parameters
  const urlParams = new URLSearchParams(window.location.search);
  const periodEndParam = urlParams.get('periodEnd');
  const brokerIdParam = urlParams.get('brokerId');
  
  // Apply brokerId from URL if present
  if (brokerIdParam) {
    const parsedBrokerId = parseInt(brokerIdParam, 10);
    if (!isNaN(parsedBrokerId)) {
      currentBrokerId = parsedBrokerId;
    }
  }
  
  // Load with the period from URL if present, otherwise load current period
  loadAccountsData(periodEndParam || undefined, currentRollupPeriod);
  
  // Setup title click to reset filters
  const accountsTitle = document.getElementById('accounts-title');
  if (accountsTitle) {
    accountsTitle.addEventListener('click', () => {
      handleReset();
    });
  }
  
  // Setup refresh link
  const refreshLink = document.getElementById('accounts-refresh-link');
  if (refreshLink) {
    refreshLink.addEventListener('click', (e) => {
      e.preventDefault();
      loadAccountsData(currentPeriodEnd || undefined, currentRollupPeriod);
    });
  }
  
  // Navigation buttons and rollup selector are created and wired when the toolbar is rendered
});

// Add animation CSS for charts
const style = document.createElement('style');
style.textContent = `
.lumos-accounts-charts-animated {
  overflow: hidden;
  transition: max-height 0.4s cubic-bezier(0.4,0,0.2,1), opacity 0.3s;
  max-height: 1000px;
  opacity: 1;
  will-change: max-height, opacity;
}
`;
document.head.appendChild(style);

})(); // End of IIFE
