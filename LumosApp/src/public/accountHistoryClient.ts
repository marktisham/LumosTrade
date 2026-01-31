// Wrap in IIFE to avoid global scope conflicts with other client files
(function() {

// Access Highcharts from window object (loaded via CDN)
const Highcharts = (window as any).Highcharts;

// Access Milestones from window object
const MILESTONES = (window as any).lumos?.milestones || [];

type AccountHistoryBalanceRow = {
  AccountID: number | null;
  Balance: number | null;
  BalanceChangeAmount: number | null;
  BalanceChangePct: number | null;
  InvestedAmount: number | null;
  NetGain: number | null;
  NetGainPct: number | null;
  TransferDescription: string | null;
  TransferAmount: number | null;
  OrdersExecuted: number | null;
  PeriodEnd: string | null;
  Comment?: string | null;
};

type SortDirection = 'asc' | 'desc';
type ColumnKey = keyof AccountHistoryBalanceRow;

type SortState = {
  key: ColumnKey;
  direction: SortDirection;
};

const DEFAULT_SORT: SortState = { key: 'PeriodEnd', direction: 'desc' };
const DEFAULT_DATE_RANGE = 'YTD';
const DEFAULT_CHART_TYPE = 'balance';
const DEFAULT_ROLLUP_PERIOD = 'daily';

type ChartType = 'balance' | 'gain';
type RollupPeriod = 'daily' | 'weekly' | 'monthly';

type AccountHistoryApiResponse = {
  asOf: string;
  history: AccountHistoryBalanceRow[];
  sort: SortState;
  appliedStartDate?: string | null;
  appliedEndDate?: string | null;
};

type ColumnConfig = {
  key: ColumnKey;
  label: string;
  dataType: 'string' | 'number' | 'date';
  isNumeric?: boolean;
  sortable: boolean;
  formatter: (row: AccountHistoryBalanceRow) => string;
};

// Current state
let currentSortState: SortState = DEFAULT_SORT;
let currentAccountId: number | null = null;
let accountHistoryChart: any = null;
let currentDateRange: string = DEFAULT_DATE_RANGE;
let currentChartType: ChartType = DEFAULT_CHART_TYPE;
let currentRollupPeriod: RollupPeriod = DEFAULT_ROLLUP_PERIOD;
let currentBrokerId: number | null = null;
let accountHistoryBookmarkBar: any = null;

// Formatting utilities
const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
};

const formatPercent = (value: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'percent',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
};

const formatDate = (value: string | Date): string => {
  let date: Date;
  if (typeof value === 'string') {
    // Parse YYYY-MM-DD as local date to avoid timezone offset issues
    const [year, month, day] = value.split('-').map(Number);
    date = new Date(year, month - 1, day);
  } else {
    date = value;
  }
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
};

const formatDateForRollup = (value: string | Date, rollupPeriod: RollupPeriod): string => {
  let date: Date;
  if (typeof value === 'string') {
    // Parse YYYY-MM-DD as local date to avoid timezone offset issues
    const [year, month, day] = value.split('-').map(Number);
    date = new Date(year, month - 1, day);
  } else {
    date = value;
  }
  
  if (rollupPeriod === 'daily') {
    // Daily: include short weekday (e.g., "Fri Dec 5, 2025")
    return date.toLocaleDateString(undefined, {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  } else if (rollupPeriod === 'weekly') {
    // Weekly: show "Week of [date]"
    const weekStart = date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
    return `Week of ${weekStart}`;
  } else {
    // Monthly: show "Month Year" (e.g., "Jan 2024")
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short'
    });
  }
};

const formatDateTime = (value: string): string => {
  const date = new Date(value);
  return date.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
};

// Helper function to generate milestone plotLines for charts
const getMilestonePlotLines = (accountId: number | null, startDate: string | null, endDate: string | null): any[] => {
  if (!MILESTONES || MILESTONES.length === 0) return [];
  
  // Filter milestones by account
  const filteredMilestones = MILESTONES.filter((m: any) => {
    // If "All Accounts" is selected (accountId === null), show all milestones
    if (accountId === null) return true;
    
    // If a specific account is selected, only show global milestones or milestones for that account
    // Use == to catch both null and undefined for global milestones
    return m.AccountID == null || m.AccountID === accountId;
  });
  
  const plotLines: any[] = [];
  
  filteredMilestones.forEach((milestone: any) => {
    const dayStart = milestone.DayStart; // YYYY-MM-DD format
    const dayEnd = milestone.DayEnd; // YYYY-MM-DD format or null
    
    // Parse DayStart as local date
    const [year, month, day] = dayStart.split('-').map(Number);
    const startTimestamp = new Date(year, month - 1, day).getTime();
    
    // Check if milestone is within the visible date range
    let inRange = true;
    if (startDate) {
      const [sy, sm, sd] = startDate.split('-').map(Number);
      const rangeStart = new Date(sy, sm - 1, sd).getTime();
      if (dayEnd) {
        const [ey, em, ed] = dayEnd.split('-').map(Number);
        const endTimestamp = new Date(ey, em - 1, ed).getTime();
        inRange = endTimestamp >= rangeStart;
      } else {
        inRange = startTimestamp >= rangeStart;
      }
    }
    if (endDate && inRange) {
      const [ey, em, ed] = endDate.split('-').map(Number);
      const rangeEnd = new Date(ey, em - 1, ed).getTime();
      inRange = startTimestamp <= rangeEnd;
    }
    
    if (!inRange) return;
    
    // Add plotLine for DayStart
    plotLines.push({
      value: startTimestamp,
      color: '#c8c8c8',
      dashStyle: 'ShortDash',
      width: 1,
      label: {
        text: milestone.Name,
        rotation: -90,
        textAlign: 'right',
        y: -5,
        x: -3,
        style: {
          color: '#c8c8c8',
          fontWeight: 'normal',
          fontSize: '10px'
        }
      },
      zIndex: 2
    });
    
    // If there's a DayEnd, add a second plotLine for the end date
    if (dayEnd) {
      const [ey, em, ed] = dayEnd.split('-').map(Number);
      const endTimestamp = new Date(ey, em - 1, ed).getTime();
      
      plotLines.push({
        value: endTimestamp,
        color: '#c8c8c8',
        dashStyle: 'ShortDash',
        width: 1,
        label: {
          text: `${milestone.Name} (End)`,
          rotation: -90,
          textAlign: 'right',
          y: -5,
          x: -3,
          style: {
            color: '#c8c8c8',
            fontWeight: 'normal',
            fontSize: '9px'
          }
        },
        zIndex: 2
      });
    }
  });
  
  return plotLines;
};

// Column definitions
const COLUMNS: ColumnConfig[] = [
  {
    key: 'PeriodEnd',
    label: 'Date',
    dataType: 'date',
    sortable: true,
    formatter: (row) => (row.PeriodEnd === null ? '—' : formatDateForRollup(row.PeriodEnd, currentRollupPeriod))
  },
  {
    key: 'Balance',
    label: 'Balance',
    dataType: 'number',
    isNumeric: true,
    sortable: true,
    formatter: (row) => (row.Balance === null ? '—' : formatCurrency(row.Balance))
  },
  {
    key: 'BalanceChangeAmount',
    label: 'Gain Amount',
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
    label: 'Gain %',
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
      return `<a href="/orders?executedDate=${encodeURIComponent(dateOnly)}${accountParam}" class="text-decoration-none" style="color: inherit; cursor: pointer; text-decoration: none;">${row.OrdersExecuted}</a>`;
    }
  },
  {
    key: 'TransferAmount',
    label: 'Transfers',
    dataType: 'number',
    isNumeric: true,
    sortable: true,
    formatter: (row) => (row.TransferAmount === null ? '—' : formatCurrency(row.TransferAmount))
  },
  {
    key: 'Comment',
    label: 'Comments',
    dataType: 'string',
    sortable: false,
    formatter: (row) => (row.Comment === null || row.Comment === undefined ? '—' : String(row.Comment))
  },
  
];

// Initialize or update the chart
const initializeOrUpdateChart = (history: AccountHistoryBalanceRow[], appliedStartDate?: string | null, appliedEndDate?: string | null) => {
  const container = document.getElementById('account-history-chart-container');
  if (!container) {
    console.error('[accountHistoryClient] Chart container not found');
    return;
  }

  // Sort data by date (ascending) for proper chart display
  const sortedHistory = [...history].sort((a, b) => {
    if (!a.PeriodEnd) return 1;
    if (!b.PeriodEnd) return -1;
    // Parse YYYY-MM-DD as local date
    const aDate = typeof a.PeriodEnd === 'string' && a.PeriodEnd.includes('-')
      ? (() => { const [y, m, d] = a.PeriodEnd.split('-').map(Number); return new Date(y, m - 1, d); })()
      : new Date(a.PeriodEnd);
    const bDate = typeof b.PeriodEnd === 'string' && b.PeriodEnd.includes('-')
      ? (() => { const [y, m, d] = b.PeriodEnd.split('-').map(Number); return new Date(y, m - 1, d); })()
      : new Date(b.PeriodEnd);
    return aDate.getTime() - bDate.getTime();
  });

  // Build chart title
  const accountSelect = document.getElementById('account-history-account-select') as HTMLSelectElement | null;
  let accountLabel = accountSelect ? (accountSelect.value === '' ? 'All Accounts' : accountSelect.options[accountSelect.selectedIndex].text) : 'All Accounts';

  // If All Accounts is selected but a specific broker is chosen, show "All (BrokerName) accounts"
  if (accountSelect && accountSelect.value === '') {
    const brokerSelect = document.getElementById('account-history-broker-select') as HTMLSelectElement | null;
    if (brokerSelect && brokerSelect.value !== '') {
      const brokers = (window as any).lumosAccountsBrokers as Array<{ BrokerID: number; Name: string }> | undefined;
      const broker = brokers ? brokers.find(b => String(b.BrokerID) === brokerSelect.value) : undefined;
      if (broker && broker.Name) {
        accountLabel = `All ${broker.Name} accounts`;
      }
    }
  }

  const earliest = sortedHistory.length > 0 ? sortedHistory[0].PeriodEnd : null;
  const latest = sortedHistory.length > 0 ? sortedHistory[sortedHistory.length - 1].PeriodEnd : null;

  const displayedStart = appliedStartDate ?? earliest;
  const displayedEnd = appliedEndDate ?? latest;

  let datePart = '';
  if (displayedStart == null && displayedEnd == null) {
    datePart = ' (All Time)';
  } else if (appliedEndDate == null && displayedStart) {
    datePart = ` (From ${formatDate(displayedStart)})`;
  } else if (displayedStart && displayedEnd) {
    datePart = ` (${formatDate(displayedStart)} - ${formatDate(displayedEnd)})`;
  } else if (!displayedStart && displayedEnd) {
    datePart = ` (Through ${formatDate(displayedEnd)})`;
  }

  const chartTypeLabel = currentChartType === 'balance' ? 'Balance History' : 'Gain History';
  const titleText = `${chartTypeLabel} - ${accountLabel}${datePart}`;

  if (currentChartType === 'balance') {
    // Balance History: Line chart with Invested Amount and Balance
    const investedData: [number, number][] = [];
    const balanceData: [number, number][] = [];

    sortedHistory.forEach(row => {
      if (row.PeriodEnd && row.InvestedAmount !== null && row.Balance !== null) {
        let timestamp: number;
        if (typeof row.PeriodEnd === 'string' && row.PeriodEnd.includes('-')) {
          const [year, month, day] = row.PeriodEnd.split('-').map(Number);
          timestamp = new Date(year, month - 1, day).getTime();
        } else {
          timestamp = new Date(row.PeriodEnd).getTime();
        }
        investedData.push([timestamp, row.InvestedAmount]);
        balanceData.push([timestamp, row.Balance]);
      }
    });

    const chartOptions: any = {
      chart: {
        type: 'line',
        backgroundColor: 'transparent'
      },
      title: {
        text: titleText,
        align: 'left',
        style: {
          fontSize: '1.25rem',
          fontWeight: '600',
          color: '#e8e8e8'
        }
      },
      xAxis: {
        type: 'datetime',
        title: { text: null },
        labels: {
          format: '{value:%b %e, %Y}',
          style: { color: '#c8c8c8' }
        },
        plotLines: getMilestonePlotLines(currentAccountId, appliedStartDate || null, appliedEndDate || null)
      },
      yAxis: {
        title: { text: null },
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
        shared: true,
        crosshairs: true,
        xDateFormat: '%b %d, %Y',
        valuePrefix: '$',
        valueDecimals: 2
      },
      legend: {
        enabled: true,
        align: 'center',
        verticalAlign: 'bottom',
        layout: 'horizontal',
        x: 0,
        y: 0,
        itemStyle: {
          color: '#e8e8e8'
        }
      },
      plotOptions: {
        line: {
          step: 'left',
          marker: {
            enabled: false,
            states: {
              hover: {
                enabled: true,
                radius: 4
              }
            }
          },
          lineWidth: 2
        }
      },
      series: [
        {
          name: 'Invested Amount',
          data: investedData,
          color: '#0d6efd',
          marker: {
            symbol: 'circle'
          }
        },
        {
          name: 'Balance',
          data: balanceData,
          color: '#00c853',
          marker: {
            symbol: 'circle'
          }
        }
      ],
      credits: {
        enabled: false
      }
    };

    const existingIsLine = !!(accountHistoryChart && accountHistoryChart.options && accountHistoryChart.options.chart && accountHistoryChart.options.chart.type === 'line');
    const existingHasTwoSeries = !!(accountHistoryChart && Array.isArray(accountHistoryChart.series) && accountHistoryChart.series.length >= 2);

    if (accountHistoryChart && existingIsLine && existingHasTwoSeries) {
      // Update existing line chart
      accountHistoryChart.series[0].setData(investedData, false);
      accountHistoryChart.series[1].setData(balanceData, false);
      accountHistoryChart.setTitle({ text: titleText });
      // Update xAxis plotLines to reflect current account filter
      accountHistoryChart.xAxis[0].update({
        plotLines: getMilestonePlotLines(currentAccountId, appliedStartDate || null, appliedEndDate || null)
      }, false);
      accountHistoryChart.redraw();
    } else {
      // Recreate chart when switching types or if existing chart doesn't match expected series
      if (accountHistoryChart) {
        try { accountHistoryChart.destroy(); } catch (err) { /* ignore */ }
      }
      accountHistoryChart = Highcharts.chart(container, chartOptions);
    }
  } else {
    // Gain History: Column chart with period-specific Gain label
    const gainData: [number, number][] = [];

    sortedHistory.forEach(row => {
      if (row.PeriodEnd && row.BalanceChangeAmount !== null) {
        let timestamp: number;
        if (typeof row.PeriodEnd === 'string' && row.PeriodEnd.includes('-')) {
          const [year, month, day] = row.PeriodEnd.split('-').map(Number);
          timestamp = new Date(year, month - 1, day).getTime();
        } else {
          timestamp = new Date(row.PeriodEnd).getTime();
        }
        gainData.push([timestamp, row.BalanceChangeAmount]);
      }
    });

    const periodLabel = currentRollupPeriod === 'daily' ? 'Daily' : (currentRollupPeriod === 'weekly' ? 'Weekly' : 'Monthly');
    const seriesName = `${periodLabel} Gain`;

    const chartOptions: any = {
      chart: {
        type: 'column',
        backgroundColor: 'transparent'
      },
      title: {
        text: titleText,
        align: 'left',
        style: {
          fontSize: '1.25rem',
          fontWeight: '600',
          color: '#e8e8e8'
        }
      },
      xAxis: {
        type: 'datetime',
        title: { text: null },
        labels: {
          format: '{value:%b %e, %Y}',
          style: { color: '#c8c8c8' }
        },
        plotLines: getMilestonePlotLines(currentAccountId, appliedStartDate || null, appliedEndDate || null)
      },
      yAxis: {
        title: { text: null },
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
          zIndex: 2
        }]
      },
      tooltip: {
        xDateFormat: '%b %d, %Y',
        valuePrefix: '$',
        valueDecimals: 2
      },
      legend: {
        enabled: false
      },
      plotOptions: {
        column: {
          borderWidth: 0,
          groupPadding: 0.05,
          pointPadding: 0.05,
          zones: [{
            value: 0,
            color: '#ff4d4f'
          }, {
            color: '#00c853'
          }]
        }
      },
      series: [{
        name: seriesName,
        data: gainData
      }],
      credits: {
        enabled: false
      }
    };

    // Always recreate chart when switching types or first creation
    if (accountHistoryChart) {
      accountHistoryChart.destroy();
    }
    accountHistoryChart = Highcharts.chart(container, chartOptions);
  }
};

// Split a header label into two lines: first word on top, rest on bottom.
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

const renderAccountHistoryTable = (
  mountPoint: HTMLElement,
  history: AccountHistoryBalanceRow[],
  sortState: SortState,
  accountId: number | null,
  dateRange: string,
  chartType: ChartType,
  rollupPeriod: RollupPeriod,
  onSort: (key: ColumnKey) => void,
  asOf?: string
) => {
  const wrapper = document.createElement('div');
  
  // Inject bookmark bar (if available)
  const bookmarkRender = (window as any).__renderAccountHistoryBookmarkBar as ((c: HTMLElement) => void) | undefined;
  if (bookmarkRender) {
    const placeholder = document.getElementById('account-history-bookmark-root');
    if (placeholder) {
      // Render into template placeholder (above the toolbar)
      bookmarkRender(placeholder);
    } else {
      // Fallback: render inside the table wrapper
      const bookmarkContainer = document.createElement('div');
      wrapper.appendChild(bookmarkContainer);
      bookmarkRender(bookmarkContainer);
    }
  }

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
  
  if (history.length === 0) {
    const alert = document.createElement('div');
    alert.className = 'alert alert-info mb-3';
    alert.innerHTML = `
      <div class="d-flex align-items-center">
        <div class="me-3" style="font-size: 2rem;">ℹ️</div>
        <div>
          <strong>No history to display</strong>
        </div>
      </div>
    `;
    wrapper.appendChild(alert);
    mountPoint.replaceChildren(wrapper);
    return;
  }
  
  const table = document.createElement('table');
  table.className = 'table table-hover table-sm align-middle';
  
  // Sync UI controls with current state (since they're in the template, not dynamically rendered)
  const accountSelect = document.getElementById('account-history-account-select') as HTMLSelectElement | null;
  if (accountSelect) {
    accountSelect.value = accountId !== null ? accountId.toString() : '';
  }
  const dateRangeSelect = document.getElementById('account-history-date-range-select') as HTMLSelectElement | null;
  if (dateRangeSelect) {
    dateRangeSelect.value = dateRange;
  }
  // Sync rollup button states
  updateRollupButtonsUI(rollupPeriod);
  const chartTypeSelect = document.getElementById('account-history-chart-type-select') as HTMLSelectElement | null;
  if (chartTypeSelect) {
    chartTypeSelect.value = chartType;
  }
  const brokerSelect = document.getElementById('account-history-broker-select') as HTMLSelectElement | null;
  if (brokerSelect) {
    brokerSelect.value = currentBrokerId !== null ? String(currentBrokerId) : '';
  }

  // Update "balances as of" message
  const balancesAsOfEl = document.getElementById('account-history-balances-as-of') as HTMLDivElement | null;
  if (balancesAsOfEl && asOf) {
    const updatesAsOf = formatDateTime(asOf);
    balancesAsOfEl.textContent = `Balances as of ${updatesAsOf}`;
  }

  // Determine which columns to render. Show Comments only when a single account is selected and rollup is daily.
  // Show Orders Placed only when rollup is daily (weekly/monthly rollups return NULL for this field).
  const columnsToRender = COLUMNS.filter(col => {
    if (col.key === 'Comment') {
      return accountId !== null && accountId !== undefined && rollupPeriod === 'daily';
    }
    if (col.key === 'OrdersExecuted') {
      return rollupPeriod === 'daily';
    }
    return true;
  });

  // Header
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');

  columnsToRender.forEach(col => {
    const th = document.createElement('th');
    // Center all headers except the Date column (PeriodEnd). Keep any numeric-end alignment for Date if it were numeric.
    th.className = col.key === 'PeriodEnd' ? (col.isNumeric ? 'text-end' : '') : 'text-center';
    th.style.whiteSpace = 'pre-line';
    th.style.cursor = col.sortable ? 'pointer' : 'default';
    th.style.userSelect = 'none';
    th.style.verticalAlign = 'top';
    // Reduce Date column width to free space for other columns
    if (col.key === 'PeriodEnd') {
      th.style.width = '120px';
      th.style.minWidth = '90px';
    }

    // Replace period-specific labels for the UI header so it shows e.g. "Daily Gain"
    let headerLabel = col.label;
    const periodLabel = rollupPeriod === 'daily' ? 'Daily' : (rollupPeriod === 'weekly' ? 'Weekly' : 'Monthly');
    if (col.key === 'BalanceChangeAmount') headerLabel = `${periodLabel} Gain`;
    if (col.key === 'BalanceChangePct') headerLabel = `${periodLabel} Gain %`;

    if (col.sortable) {
      const isSorted = sortState.key === col.key;
      const indicator = isSorted
        ? (sortState.direction === 'asc' ? ' ▲' : ' ▼')
        : '';
      th.innerHTML = splitHeaderLabel(headerLabel, indicator);
      th.addEventListener('click', () => onSort(col.key));
    } else {
      th.textContent = headerLabel;
    }

    // Make Comments column narrower and allow header wrapping
    if (col.key === 'Comment') {
      th.style.width = '160px';
      th.style.minWidth = '120px';
      th.style.whiteSpace = 'normal';
    }

    headerRow.appendChild(th);
  });
  
  thead.appendChild(headerRow);
  table.appendChild(thead);
  
  // Body
  const tbody = document.createElement('tbody');
  
  history.forEach(row => {
    const tr = document.createElement('tr');

    // NOTE: rows are no longer clickable; only the Date cell will be a link when appropriate.

      columnsToRender.forEach(col => {
        const td = document.createElement('td');
        // Center all cell contents except the Date column (PeriodEnd)
        td.className = col.key === 'PeriodEnd' ? (col.isNumeric ? 'text-end' : '') : 'text-center';
        if (col.key === 'PeriodEnd') {
          td.style.width = '120px';
          td.style.minWidth = '90px';
        }
        // Comments column: reduce width and enable wrapping
        if (col.key === 'Comment') {
          td.style.width = '160px';
          td.style.minWidth = '120px';
          td.style.whiteSpace = 'normal';
          td.style.wordBreak = 'break-word';
          td.style.overflowWrap = 'break-word';
          // left-align comment text for readability
          td.className = '';
          td.style.textAlign = 'left';
        }
      const raw = col.formatter(row);

      // If this is the Date column, make only the date cell clickable for all rollup periods
      let cellContent: string | null = null;
      if (col.key === 'PeriodEnd' && row.PeriodEnd) {
        const dateValue = row.PeriodEnd;
        const dateOnly = typeof dateValue === 'string' && dateValue.length >= 10 ? dateValue.substring(0, 10) : dateValue;
        // Map client rollup strings to numeric values expected by trade history (1=Daily,2=Weekly,3=Monthly)
        const rpMap: Record<RollupPeriod, number> = { daily: 1, weekly: 2, monthly: 3 };
        const rpNum = rpMap[currentRollupPeriod] || 1;
        const accountParam = currentAccountId !== null ? `&accountId=${currentAccountId}` : '';
        const brokerParam = currentBrokerId !== null ? `&brokerId=${currentBrokerId}` : '';
        cellContent = `<a href="/tradeHistory?periodEnd=${encodeURIComponent(dateOnly)}&rollupPeriod=${rpNum}${accountParam}${brokerParam}" class="text-decoration-none" style="color: inherit; cursor: pointer; text-decoration: none;">${raw}</a>`;
      }

      // Add tooltip for TransferAmount when description exists
      if (col.key === 'TransferAmount' && row.TransferDescription && row.TransferAmount !== null) {
        td.textContent = String(raw);
        td.title = row.TransferDescription;
        td.style.cursor = 'help';
      } else {
        // Insert formatted content (may contain HTML)
        const hasHtml = /<\/?[a-z][\s\S]*>/i.test(String(raw));
        if (hasHtml) {
          td.innerHTML = cellContent !== null ? cellContent : String(raw);
        } else {
          if (cellContent !== null) {
            td.innerHTML = cellContent;
          } else {
            td.textContent = String(raw);
          }
        }
      }

      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });
  
  table.appendChild(tbody);
  wrapper.appendChild(table);
  ensureRenderRowCount(wrapper, history.length);
  mountPoint.replaceChildren(wrapper);
};

const fetchAccountHistoryData = async (sortState: SortState, accountId: number | null): Promise<AccountHistoryApiResponse> => {
  const params = new URLSearchParams({
    sortKey: sortState.key,
    sortDirection: sortState.direction,
    accountId: accountId === null ? '' : accountId.toString()
  });
  
  // include dateRange and rollupPeriod for server-side filtering
  params.set('dateRange', currentDateRange || DEFAULT_DATE_RANGE);
  // Map client rollup period strings to numeric values expected by server (1=Daily,2=Weekly,3=Monthly)
  const rollupMap: Record<RollupPeriod, string> = { daily: '1', weekly: '2', monthly: '3' };
  params.set('rollupPeriod', rollupMap[currentRollupPeriod] || rollupMap[DEFAULT_ROLLUP_PERIOD]);
  if (currentBrokerId) params.set('brokerId', String(currentBrokerId));
  const response = await fetch(`/request/accountHistory?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return response.json();
};

// Trigger a refresh of balances by calling the same accounts endpoint with op=refresh
const fetchRefreshBalances = async (): Promise<any> => {
  const params = new URLSearchParams({
    sortKey: currentSortState.key,
    sortDirection: currentSortState.direction,
    op: 'refresh'
  });

  const response = await fetch(`/request/accounts?${params.toString()}`, {
    method: 'GET',
    headers: { Accept: 'application/json' }
  });

  if (!response.ok) {
    throw new Error(`Failed to resync orders: ${response.statusText}`);
  }

  return response.json();
};

// Trigger a balances-only refresh (same as Accounts 'Refresh Balances')
const fetchRefreshBalancesOnly = async (): Promise<any> => {
  const params = new URLSearchParams({
    sortKey: String(currentSortState.key),
    sortDirection: currentSortState.direction,
    op: 'refreshBalances'
  });

  const response = await fetch(`/request/accounts?${params.toString()}`, {
    method: 'GET',
    headers: { Accept: 'application/json' }
  });

  if (!response.ok) {
    throw new Error(`Failed to refresh balances: ${response.statusText}`);
  }

  return response.json();
};

const handleSort = (key: ColumnKey) => {
  if (accountHistoryBookmarkBar) accountHistoryBookmarkBar.clearSelection();
  if (currentSortState.key === key) {
    // Toggle direction
    currentSortState.direction = currentSortState.direction === 'asc' ? 'desc' : 'asc';
  } else {
    // New column, default to descending for date and numeric, ascending for text
    const col = COLUMNS.find(c => c.key === key);
    currentSortState = {
      key,
      direction: col?.dataType === 'string' ? 'asc' : 'desc'
    };
  }
  
  loadAccountHistoryData(currentAccountId);
};

const setLoadingState = (mountPoint: HTMLElement, message: string = 'Loading account history...') => {
  mountPoint.innerHTML = `
    <div class="text-center py-5">
      <div class="spinner-border spinner-border-sm text-secondary me-2" role="status"></div>
      <span class="fs-5 text-muted align-middle">${message}</span>
    </div>
  `;
};

// Update rollup buttons UI to reflect current rollup period
const updateRollupButtonsUI = (rp: RollupPeriod) => {
  const daily = document.getElementById('account-history-rollup-daily-btn') as HTMLButtonElement | null;
  const weekly = document.getElementById('account-history-rollup-weekly-btn') as HTMLButtonElement | null;
  const monthly = document.getElementById('account-history-rollup-monthly-btn') as HTMLButtonElement | null;
  if (daily) daily.className = `btn btn-sm btn-outline-secondary${rp === 'daily' ? ' active' : ''}`;
  if (weekly) weekly.className = `btn btn-sm btn-outline-secondary${rp === 'weekly' ? ' active' : ''}`;
  if (monthly) monthly.className = `btn btn-sm btn-outline-secondary${rp === 'monthly' ? ' active' : ''}`;
};

// Populate brokers dropdown using server-injected list
function populateBrokerDropdown() {
  const select = document.getElementById('account-history-broker-select') as HTMLSelectElement | null;
  if (!select) return;
  try {
    const brokers = (window as any).lumosAccountsBrokers as Array<{ BrokerID: number; Name: string }> | undefined;
    select.innerHTML = '<option value="">All Brokers</option>';
    if (brokers && brokers.length > 0) {
      const sorted = [...brokers].sort((a, b) => a.Name.localeCompare(b.Name));
      sorted.forEach((b) => {
        const opt = document.createElement('option');
        opt.value = String(b.BrokerID);
        opt.textContent = b.Name;
        select.appendChild(opt);
      });
    }
    if (currentBrokerId !== null) select.value = String(currentBrokerId);
  } catch (err) {
    console.error('[accountHistoryClient] Failed to populate brokers from page data:', err);
  }
}

// Filter account dropdown options according to selected broker
function filterAccountsByBroker(brokerId: number | null) {
  const accountSelect = document.getElementById('account-history-account-select') as HTMLSelectElement | null;
  if (!accountSelect) return;
  const opts = Array.from(accountSelect.options);
  opts.forEach(opt => {
    if (opt.value === '') {
      opt.hidden = false;
      return;
    }
    const dataBroker = opt.getAttribute('data-broker');
    if (!dataBroker) {
      opt.hidden = false;
    } else {
      opt.hidden = brokerId === null ? false : String(brokerId) !== dataBroker;
    }
  });
  // If currently selected account is hidden, reset selection to All
  const selectedOpt = accountSelect.options[accountSelect.selectedIndex];
  if (selectedOpt && selectedOpt.hidden) {
    accountSelect.value = '';
    currentAccountId = null;
  }
}

// Sort account options alphabetically (keep the empty 'All Accounts' option at the top)
function sortAccountOptions() {
  const accountSelect = document.getElementById('account-history-account-select') as HTMLSelectElement | null;
  if (!accountSelect) return;
  const opts = Array.from(accountSelect.options);
  // Keep the first 'All Accounts' option in place
  const first = opts.find(o => o.value === '');
  const rest = opts.filter(o => o.value !== '');
  rest.sort((a, b) => a.textContent!.localeCompare(b.textContent!));
  // Rebuild select: clear and re-append
  accountSelect.innerHTML = '';
  if (first) accountSelect.appendChild(first);
  rest.forEach(o => accountSelect.appendChild(o));
}

const loadAccountHistoryData = async (accountId: number | null) => {
  const mountPoint = document.querySelector('[data-account-history-table-root]') as HTMLElement;
  if (!mountPoint) {
    console.error('[accountHistoryClient] Mount point not found');
    return;
  }
  
  let loadingTimer: number | null = window.setTimeout(() => setLoadingState(mountPoint), 250);

  try {
    const data = await fetchAccountHistoryData(currentSortState, accountId);
    currentSortState = data.sort as SortState;
    
    
    if (loadingTimer) { 
      clearTimeout(loadingTimer); 
      loadingTimer = null; 
    }

    // Update chart with new data, passing server-applied date window if present
    initializeOrUpdateChart(data.history, data.appliedStartDate ?? null, data.appliedEndDate ?? null);
    
    renderAccountHistoryTable(
      mountPoint,
      data.history,
      currentSortState,
      currentAccountId,
      currentDateRange,
      currentChartType,
      currentRollupPeriod,
      handleSort,
      data.asOf
    );
  } catch (error) {
    console.error('[accountHistoryClient] Error loading account history:', error);
    if (loadingTimer) { 
      clearTimeout(loadingTimer); 
      loadingTimer = null; 
    }
    mountPoint.innerHTML = `
      <div class="alert alert-danger">
        <strong>Error loading account history:</strong> ${error instanceof Error ? error.message : 'Unknown error'}
      </div>
    `;
  }
};

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  // Initialize with defaults (URL params checked below)
  currentSortState = DEFAULT_SORT;
  currentDateRange = DEFAULT_DATE_RANGE;
  currentChartType = DEFAULT_CHART_TYPE;
  currentRollupPeriod = DEFAULT_ROLLUP_PERIOD;
  currentBrokerId = null;

// ==========================================
// Date Range Dropdown Logic
// ==========================================

let dateRangeDropdown: any = null;

const initDateRangeDropdown = () => {
  if (!(window as any).DateRangeDropdown) {
    console.warn('[accountHistoryClient] DateRangeDropdown not available');
    return;
  }
  dateRangeDropdown = new (window as any).DateRangeDropdown({
    containerId: 'account-history-date-range-dropdown',
    searchInputId: 'account-history-date-range-search',
    listContainerId: 'account-history-date-range-list',
    labelElementId: 'account-history-date-range-label',
    milestones: MILESTONES,
    defaultValue: currentDateRange,
    accountId: currentAccountId,
    onChange: (value: string) => {
      currentDateRange = value;
      loadAccountHistoryData(currentAccountId);
    }
  });
};

  // Check if an accountId was passed in the query string
  const urlParams = new URLSearchParams(window.location.search);
  const accountIdParam = urlParams.get('accountId');
  if (accountIdParam && accountIdParam !== '' && accountIdParam !== 'null') {
    currentAccountId = parseInt(accountIdParam, 10);
  }
  // Check if a brokerId was passed in the query string and use it as the initial filter
  const brokerIdParam = urlParams.get('brokerId');
  if (brokerIdParam && brokerIdParam !== '' && brokerIdParam !== 'null') {
    const parsed = parseInt(brokerIdParam, 10);
    if (!isNaN(parsed)) currentBrokerId = parsed;
  }
  // Check if a rollupPeriod was passed in the query string
  const rollupPeriodParam = urlParams.get('rollupPeriod');
  if (rollupPeriodParam && rollupPeriodParam !== '' && rollupPeriodParam !== 'null') {
    const validPeriods: RollupPeriod[] = ['daily', 'weekly', 'monthly'];
    if (validPeriods.includes(rollupPeriodParam as RollupPeriod)) {
      currentRollupPeriod = rollupPeriodParam as RollupPeriod;
    }
  }

  // Reset handler - restore defaults (used by title click)
  const handleReset = () => {
    currentSortState = DEFAULT_SORT;
    currentDateRange = DEFAULT_DATE_RANGE;
    currentChartType = DEFAULT_CHART_TYPE;
    currentRollupPeriod = DEFAULT_ROLLUP_PERIOD;
    currentAccountId = null;
    currentBrokerId = null;

    // Update UI controls
    const accountSelect = document.getElementById('account-history-account-select') as HTMLSelectElement | null;
    if (accountSelect) accountSelect.value = '';
    const brokerSelect = document.getElementById('account-history-broker-select') as HTMLSelectElement | null;
    if (brokerSelect) brokerSelect.value = '';
    if (dateRangeDropdown) {
      dateRangeDropdown.setAccountId(null);
      dateRangeDropdown.setValue(currentDateRange);
    }
    updateRollupButtonsUI(currentRollupPeriod);
    const chartTypeSelect = document.getElementById('account-history-chart-type-select') as HTMLSelectElement | null;
    if (chartTypeSelect) chartTypeSelect.value = currentChartType;

    // Reload with defaults
    loadAccountHistoryData(currentAccountId);
  };

  // Initialize bookmark bar for AccountHistory view (re-usable client-side component)
  accountHistoryBookmarkBar = (window as any).BookmarkBar ? new (window as any).BookmarkBar(
    'AccountHistoryViewState',
    (savedState: any) => {
      // Apply saved state then reload
      currentSortState = savedState.sort || currentSortState;
      currentDateRange = savedState.dateRange || currentDateRange;
      currentChartType = savedState.chartType || currentChartType;
      // Support numeric rollup values (1=daily,2=weekly,3=monthly)
      const savedRp = savedState.rollupPeriod;
      if (typeof savedRp === 'number') {
        currentRollupPeriod = savedRp === 2 ? 'weekly' : (savedRp === 3 ? 'monthly' : 'daily');
      } else {
        currentRollupPeriod = savedRp || currentRollupPeriod;
      }
      currentAccountId = typeof savedState.accountId !== 'undefined' ? savedState.accountId : currentAccountId;
      currentBrokerId = typeof savedState.brokerId !== 'undefined' ? savedState.brokerId : currentBrokerId;
      
      // Update UI controls to match state
      const accountSelect = document.getElementById('account-history-account-select') as HTMLSelectElement;
      if (accountSelect) accountSelect.value = currentAccountId !== null ? currentAccountId.toString() : '';
      
      updateRollupButtonsUI(currentRollupPeriod);
      
      const brokerSelect = document.getElementById('account-history-broker-select') as HTMLSelectElement;
      if (brokerSelect) brokerSelect.value = currentBrokerId !== null ? String(currentBrokerId) : '';

      const chartTypeSelect = document.getElementById('account-history-chart-type-select') as HTMLSelectElement;
      if (chartTypeSelect) chartTypeSelect.value = currentChartType;
      
      if (dateRangeDropdown) {
        dateRangeDropdown.setAccountId(currentAccountId);
        dateRangeDropdown.setValue(currentDateRange);
      }
      
      loadAccountHistoryData(currentAccountId);
    },
    () => {
      return {
        sort: currentSortState,
        dateRange: currentDateRange,
        chartType: currentChartType,
        rollupPeriod: currentRollupPeriod,
        accountId: currentAccountId,
        brokerId: currentBrokerId
      };
    },
    handleReset,
    (window as any).LUMOS_DEMO_MODE || false
  ) : null;
  // Expose renderer to top-level render function
  (window as any).__renderAccountHistoryBookmarkBar = (container: HTMLElement) => {
    if (accountHistoryBookmarkBar) accountHistoryBookmarkBar.render(container);
  };
  
  // Rollup period selector
  // Rollup period buttons
  updateRollupButtonsUI(currentRollupPeriod);
  const dailyBtn = document.getElementById('account-history-rollup-daily-btn') as HTMLButtonElement | null;
  const weeklyBtn = document.getElementById('account-history-rollup-weekly-btn') as HTMLButtonElement | null;
  const monthlyBtn = document.getElementById('account-history-rollup-monthly-btn') as HTMLButtonElement | null;
  if (dailyBtn) {
    dailyBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (accountHistoryBookmarkBar) accountHistoryBookmarkBar.clearSelection();
      currentRollupPeriod = 'daily';
      updateRollupButtonsUI(currentRollupPeriod);
      loadAccountHistoryData(currentAccountId);
    });
  }
  if (weeklyBtn) {
    weeklyBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (accountHistoryBookmarkBar) accountHistoryBookmarkBar.clearSelection();
      currentRollupPeriod = 'weekly';
      updateRollupButtonsUI(currentRollupPeriod);
      loadAccountHistoryData(currentAccountId);
    });
  }
  if (monthlyBtn) {
    monthlyBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (accountHistoryBookmarkBar) accountHistoryBookmarkBar.clearSelection();
      currentRollupPeriod = 'monthly';
      updateRollupButtonsUI(currentRollupPeriod);
      loadAccountHistoryData(currentAccountId);
    });
  }
  
  // Chart type selector
  const chartTypeSelect = document.getElementById('account-history-chart-type-select') as HTMLSelectElement;
  if (chartTypeSelect) {
    chartTypeSelect.value = currentChartType;
    chartTypeSelect.addEventListener('change', (e) => {
      if (accountHistoryBookmarkBar) accountHistoryBookmarkBar.clearSelection();
      const target = e.target as HTMLSelectElement;
      currentChartType = (target.value as ChartType) || DEFAULT_CHART_TYPE;
      loadAccountHistoryData(currentAccountId);
    });
  }

  // Set the dropdown to the current account
  const accountSelect = document.getElementById('account-history-account-select') as HTMLSelectElement;
  if (accountSelect) {
    // Set initial account selection (may be adjusted after broker filtering)
    if (currentAccountId !== null) {
      accountSelect.value = currentAccountId.toString();
    } else {
      accountSelect.value = '';
    }
    
    // Handle account selection change
    accountSelect.addEventListener('change', (e) => {
      if (accountHistoryBookmarkBar) accountHistoryBookmarkBar.clearSelection();
      const target = e.target as HTMLSelectElement;
      const selectedValue = target.value;
      currentAccountId = selectedValue === '' ? null : parseInt(selectedValue, 10);
      if (dateRangeDropdown) {
        dateRangeDropdown.setAccountId(currentAccountId);
      }
      loadAccountHistoryData(currentAccountId);
    });
  }

  // Broker select: populate and wire change handler
  const brokerSelect = document.getElementById('account-history-broker-select') as HTMLSelectElement | null;
  if (brokerSelect) {
    // Populate options and apply initial account filtering
    populateBrokerDropdown();
    // Apply filtering to account dropdown based on any restored broker selection
    filterAccountsByBroker(currentBrokerId);
    // Ensure account list is sorted alphabetically (All Accounts remains on top)
    sortAccountOptions();
    // Ensure current account selection is still valid after filtering
    const selectedAccountOption = accountSelect ? accountSelect.options[accountSelect.selectedIndex] : null;
    if (selectedAccountOption && selectedAccountOption.hidden) {
      if (accountSelect) accountSelect.value = '';
      currentAccountId = null;
    }
    brokerSelect.addEventListener('change', (e) => {
      if (accountHistoryBookmarkBar) accountHistoryBookmarkBar.clearSelection();
      const target = e.target as HTMLSelectElement;
      currentBrokerId = target.value === '' ? null : parseInt(target.value, 10);
      // Filter accounts to those belonging to selected broker
      filterAccountsByBroker(currentBrokerId);
      // Re-sort account options after filtering
      sortAccountOptions();
      // If current account was from another broker, clear it
      const selOpt = accountSelect ? accountSelect.options[accountSelect.selectedIndex] : null;
      if (selOpt && selOpt.hidden) {
        if (accountSelect) accountSelect.value = '';
        currentAccountId = null;
      }
      loadAccountHistoryData(currentAccountId);
    });
  }

  // Title click resets filters (consistent with Accounts page)
  const accountHistoryTitle = document.getElementById('account-history-title') as HTMLElement | null;
  if (accountHistoryTitle) {
    accountHistoryTitle.addEventListener('click', () => {
      handleReset();
    });
  }

  // Refresh Balances (balances-only) button - mimics Accounts page behavior
  const refreshOnlyBtn = document.getElementById('account-history-refresh-only-balances-btn') as HTMLButtonElement | null;
  if (refreshOnlyBtn) {
    refreshOnlyBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      const mountPoint = document.querySelector('[data-account-history-table-root]') as HTMLElement | null;
      if (!mountPoint) return;
      let refreshTimer: number | null = window.setTimeout(() => setLoadingState(mountPoint, 'Refreshing Balances...'), 250);
      try {
        const result = await fetchRefreshBalancesOnly();
        if (refreshTimer) { clearTimeout(refreshTimer); refreshTimer = null; }
        // Reload history data after refresh
        await loadAccountHistoryData(currentAccountId);
        if (result.refreshErrors) {
          const cardBody = mountPoint.closest('.card-body');
          (window as any).LumosErrorUtils.displayDismissibleError(cardBody || mountPoint, result.refreshErrors, 'Refresh Balances completed with errors');
        }
      } catch (err) {
        console.error('[accountHistoryClient] Refresh balances failed', err);
        if (refreshTimer) { clearTimeout(refreshTimer); refreshTimer = null; }
        if (mountPoint) {
          (window as any).LumosErrorUtils.displayDismissibleError(mountPoint, err instanceof Error ? err.message : String(err), 'Failed to refresh balances');
        }
      }
    });
  }

  // Accounts button: navigate to accounts page
  const accountsBtn = document.getElementById('account-history-nav-accounts-btn') as HTMLButtonElement | null;
  if (accountsBtn) {
    accountsBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const params = new URLSearchParams();
      if (currentBrokerId) params.set('brokerId', String(currentBrokerId));
      const queryString = params.toString();
      window.location.href = queryString ? `/accounts?${queryString}` : '/accounts';
    });
  }

  // Trades button: navigate to Trade Explorer
  const tradesBtn = document.getElementById('account-history-nav-trades-btn') as HTMLButtonElement | null;
  if (tradesBtn) {
    tradesBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const params = new URLSearchParams();
      if (currentBrokerId) params.set('brokerId', String(currentBrokerId));
      if (currentAccountId) params.set('accountId', String(currentAccountId));
      const queryString = params.toString();
      window.location.href = queryString ? `/trades?${queryString}` : '/trades';
    });
  }

  // Performance button: navigate to Trade Performance (Trade History)
  const perfBtn = document.getElementById('account-history-nav-performance-btn') as HTMLButtonElement | null;
  if (perfBtn) {
    perfBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const params = new URLSearchParams();
      if (currentBrokerId) params.set('brokerId', String(currentBrokerId));
      if (currentAccountId) params.set('accountId', String(currentAccountId));
      const queryString = params.toString();
      window.location.href = queryString ? `/tradeHistory?${queryString}` : '/tradeHistory';
    });
  }

  // Orders button: navigate to Orders
  const ordersBtn = document.getElementById('account-history-nav-orders-btn') as HTMLButtonElement | null;
  if (ordersBtn) {
    ordersBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const params = new URLSearchParams();
      if (currentBrokerId) params.set('brokerId', String(currentBrokerId));
      if (currentAccountId) params.set('accountId', String(currentAccountId));
      const queryString = params.toString();
      window.location.href = queryString ? `/orders?${queryString}` : '/orders';
    });
  }

  // Resync Brokers button: call same endpoint used by Accounts to refresh balances
  const refreshBalancesBtn = document.getElementById('account-history-refresh-balances-btn') as HTMLButtonElement | null;
  if (refreshBalancesBtn) {
    refreshBalancesBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      const mountPoint = document.querySelector('[data-account-history-table-root]') as HTMLElement | null;
      if (!mountPoint) return;
      let refreshTimer: number | null = window.setTimeout(() => setLoadingState(mountPoint, 'Refreshing Orders...'), 250);
      try {
        const result = await fetchRefreshBalances();
        if (refreshTimer) { clearTimeout(refreshTimer); refreshTimer = null; }
        // After refresh completes, reload history data
        await loadAccountHistoryData(currentAccountId);
        if (result.refreshErrors) {
          const cardBody = mountPoint.closest('.card-body');
          (window as any).LumosErrorUtils.displayDismissibleError(cardBody || mountPoint, result.refreshErrors, 'Resync Orders completed with errors');
        }
      } catch (err) {
        console.error('[accountHistoryClient] Resync orders failed', err);
        if (refreshTimer) { clearTimeout(refreshTimer); refreshTimer = null; }
        if (mountPoint) {
          (window as any).LumosErrorUtils.displayDismissibleError(mountPoint, err instanceof Error ? err.message : String(err), 'Failed to resync orders');
        }
      }
    });
  }
  
  // Initialize Date Range Dropdown
  initDateRangeDropdown();

  // Initial load
  loadAccountHistoryData(currentAccountId);
});

})(); // End of IIFE
