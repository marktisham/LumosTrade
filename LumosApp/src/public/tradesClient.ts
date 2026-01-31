type TradeRow = {
  TradeID: number | null;
  AccountID: number;
  BrokerID: number;
  Symbol: string;
  LongTrade: boolean;
  WinningTrade: boolean | null;
  OpenDate: string;
  CloseDate: string | null;
  DurationMS: string | null;
  Closed: boolean;
  OpenQuantity: number;
  BreakEvenPrice: number;
  CurrentPrice: number | null;
  CurrentCost: number;
  CurrentValue: number;
  TotalGain: number | null;
  TotalGainPct: number | null;
  LargestRisk: number;
  TotalFees: number;
  TotalOrderCount: number;
  ManuallyAdjusted?: boolean;
  RealizedGain?: number | null;
  UnrealizedGain?: number | null;
  AvgEntryPrice?: number | null;
  AvgExitPrice?: number | null;
  AccountName?: string;
  BrokerName?: string;
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

type SortDirection = 'asc' | 'desc';
type ColumnKey = keyof TradeRow;
type LongTradeFilterValue = 'all' | 'long' | 'short';
type WinningTradeFilterValue = 'all' | 'win' | 'loss';
type ClosedState = 'all' | 'open' | 'closed';

type SortState = {
  key: ColumnKey;
  direction: SortDirection;
};

type TradesApiResponse = {
  asOf: string;
  trades: TradeRow[];
  sort: SortState;
  quotesAsOf?: string | null;
};

type ColumnConfig = {
  key: ColumnKey;
  label: string;
  dataType: 'number' | 'string' | 'date' | 'boolean';
  formatter?: (row: TradeRow) => string;
  isNumeric?: boolean;
};

const REQUEST_ENDPOINT = '/request/trades';
const MILESTONES = (window as any).lumos?.milestones || [];

// Access Highcharts from window object (loaded via CDN)
const Highcharts = (window as any).Highcharts;

// Chart state
let tradesChart: any = null;
type ChartType = 'gainVsCost' | 'netGain' | 'distribution';
let currentChartType: ChartType = 'gainVsCost';
const validChartTypes: ChartType[] = ['gainVsCost', 'netGain', 'distribution'];

const renderNoChartData = (container: HTMLElement, message: string = 'No trades to display') => {
  container.innerHTML = `
    <div class="d-flex align-items-center justify-content-center" style="min-height: 320px;">
      <div class="text-center text-muted">
        <i class="fa-solid fa-chart-line fa-3x mb-3 opacity-25"></i>
        <p class="fs-5 mb-1">${message}</p>
        <p class="small">Try adjusting your filters</p>
      </div>
    </div>
  `;
};

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  dateStyle: 'medium',
  timeStyle: 'short'
});

// Helper functions
const formatDuration = (ms: number): string => {
  const seconds = ms / 1000;
  const minutes = seconds / 60;
  const hours = minutes / 60;
  const days = hours / 24;
  const weeks = days / 7;

  if (seconds < 60) {
    return `${Math.round(seconds)}s`;
  } else if (minutes < 60) {
    return `${Math.round(minutes)}m`;
  } else if (hours < 24) {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  } else if (days < 30) {
    return `${Math.round(days)}d`;
  } else {
    const w = Math.floor(weeks);
    const d = Math.round((weeks - w) * 7);
    return d > 0 ? `${w}w ${d}d` : `${w}w`;
  }
};

// Format numbers so they're rounded to 2 decimals but omit decimals when the
// rounded value is a whole number (e.g. 123.00 -> "123", 123.45 -> "123.45")
const formatNumberWithOptionalDecimals = (value: number): string => {
  const rounded = Math.round(value * 100) / 100;
  const abs = Math.abs(rounded);
  const isWhole = Math.abs(rounded - Math.round(rounded)) < 1e-9;
  if (isWhole) {
    return new Intl.NumberFormat(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(rounded);
  }
  return new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(rounded);
};

const formatCurrency = (value: number): string => {
  if (value < 0) {
    return `($${formatNumberWithOptionalDecimals(Math.abs(value))})`;
  }
  return `$${formatNumberWithOptionalDecimals(value)}`;
};

const formatQuantity = (value: number): string => {
  const rounded = Math.round(value * 100) / 100;
  const isWhole = rounded % 1 === 0;
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: isWhole ? 0 : 2,
    maximumFractionDigits: isWhole ? 0 : 2
  }).format(rounded);
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
    // Assign any rounding difference to the larger portion
    if (absA >= absB) aPct += diff; else bPct += diff;
  }
  return [aPct, bPct];
};

// Account and Broker mapping from server
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
  {
    key: 'TradeID',
    label: 'Trade ID',
    dataType: 'number',
    isNumeric: true
  },
  {
    key: 'AccountID',
    label: 'Account',
    dataType: 'number',
    isNumeric: false,
    formatter: (row) => accountMap.get(row.AccountID) ?? String(row.AccountID)
  },
  { key: 'Symbol', label: 'Symbol', dataType: 'string' },
  {
    key: 'LongTrade',
    label: 'DIRECTION',
    dataType: 'boolean',
    formatter: (row) => (row.LongTrade ? 'Long' : 'Short')
  },
  {
    key: 'CurrentCost',
    label: 'Current Cost',
    dataType: 'number',
    isNumeric: true,
    formatter: (row) => (row.CurrentCost === null || row.CurrentCost === undefined || row.CurrentCost === 0) ? '—' : formatCurrency(row.CurrentCost)
  },
  {
    key: 'CurrentValue',
    label: 'Current Value',
    dataType: 'number',
    isNumeric: true,
    formatter: (row) => (row.CurrentValue === null || row.CurrentValue === undefined || row.CurrentValue === 0) ? '—' : formatCurrency(row.CurrentValue)
  },
  {
    key: 'TotalGain',
    label: 'Gain',
    dataType: 'number',
    isNumeric: true,
    formatter: (row) => formatCurrency(row.TotalGain ?? 0)
  },
  {
    key: 'TotalGainPct',
    label: 'Gain Pct',
    dataType: 'number',
    isNumeric: true,
    formatter: (row) => {
      if (row.TotalGainPct === null || row.TotalGainPct === undefined) return '—';
      const pctFormatter = new Intl.NumberFormat(undefined, {
        style: 'percent',
        minimumFractionDigits: 1,
        maximumFractionDigits: 1
      });
      return pctFormatter.format(row.TotalGainPct);
    }
  },
  { key: 'TotalOrderCount', label: 'Orders', dataType: 'number', isNumeric: true },
  {
    key: 'OpenDate',
    label: 'Open',
    dataType: 'date',
    formatter: (row) => {
      if (!row.OpenDate) return '—';
      const date = new Date(row.OpenDate);
      if (isNaN(date.getTime())) return '—';
      const datePart = date.toLocaleDateString(undefined, { dateStyle: 'medium' });
      const timePart = date.toLocaleTimeString(undefined, { timeStyle: 'short' });
      return `${datePart}\n${timePart}`;
    }
  },
  {
    key: 'CloseDate',
    label: 'Close',
    dataType: 'date',
    formatter: (row) => {
      if (!row.CloseDate) return '—';
      const date = new Date(row.CloseDate);
      if (isNaN(date.getTime())) return '—';
      const datePart = date.toLocaleDateString(undefined, { dateStyle: 'medium' });
      const timePart = date.toLocaleTimeString(undefined, { timeStyle: 'short' });
      return `${datePart}\n${timePart}`;
    }
  },
  {
    key: 'DurationMS',
    label: 'Duration',
    dataType: 'number',
    isNumeric: true,
    formatter: (row) => (row.DurationMS === null || row.DurationMS === undefined ? '—' : formatDuration(Number(row.DurationMS)))
  },

  {
    key: 'TotalFees',
    label: 'Fees',
    dataType: 'number',
    isNumeric: true,
    formatter: (row) => row.TotalFees === 0 ? '—' : formatCurrency(row.TotalFees)
  },
];

// Initialize or update the chart
const initializeOrUpdateChart = (trades: TradeRow[], groupBy: 'symbol' | 'symbolGroup') => {
  const container = document.getElementById('trades-chart-container');
  if (!container) {
    console.error('[tradesClient] Chart container not found');
    return;
  }

  if (trades.length === 0) {
    if (tradesChart) {
      try { tradesChart.destroy(); } catch (err) { }
      tradesChart = null;
    }
    renderNoChartData(container);
    return;
  }

  if (currentChartType === 'gainVsCost') {
    // Build one series per symbol so the legend can toggle symbols on/off
    const seriesMap: Map<string, any[]> = new Map();

    trades.forEach(row => {
      const tradeTime = row.OpenDate;
      if (!tradeTime) return;

      const timestamp = new Date(tradeTime).getTime();
      const totalGain = row.TotalGain ?? 0;
      const totalGainAbs = Math.abs(totalGain);
      const cost = Number(row.CurrentCost ?? 0);
      const color = totalGain < 0 ? '#ff4d4f' : '#00c853';
      const symbol = row.Symbol || 'Unknown';

      const point: any = {
        x: timestamp,
        y: cost, // Y axis is Trade Cost
        z: totalGainAbs, // bubble size represents TotalGain magnitude
        color: color,
        marker: { fillOpacity: 0.6 },
        accountName: row.AccountName || '',
        totalGain: totalGain,
        totalGainPct: row.TotalGainPct ?? null
      };

      if (!seriesMap.has(symbol)) seriesMap.set(symbol, []);
      seriesMap.get(symbol)!.push(point);
    });

    const series: any[] = [];
    seriesMap.forEach((points, symbol) => {
      series.push({
        name: symbol,
        data: points,
        // start visible; let users toggle via legend
        visible: true
      });
    });

    const hasSeriesData = series.some(s => Array.isArray(s.data) && s.data.length > 0);
    if (!hasSeriesData) {
      if (tradesChart) {
        try { tradesChart.destroy(); } catch (err) { }
        tradesChart = null;
      }
      renderNoChartData(container);
      return;
    }

    const chartOptions: any = {
      chart: {
        type: 'bubble',
        backgroundColor: 'transparent',
        zoomType: 'xy'
      },
      title: {
        text: 'Gain vs Cost',
        align: 'left',
        style: {
          fontSize: '1.25rem',
          fontWeight: '600',
          color: '#e8e8e8'
        }
      },

      xAxis: {
        type: 'datetime',
        title: { text: 'Trade Open Date' },
        gridLineColor: 'rgba(255,255,255,0.06)',
        gridLineWidth: 1,
        labels: {
          format: '{value:%b %e, %Y}',
          style: { color: '#c8c8c8' }
        }
      },
      yAxis: {
        title: { text: 'Trade Cost' },
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
        useHTML: true,
        headerFormat: '<table>',
        pointFormatter: function(this: any): string {
          const symbol = (this.series && this.series.name) ? this.series.name : '';
          const accountName = this.point && this.point.accountName ? this.point.accountName : '';
          const date = Highcharts.dateFormat('%b %e, %Y %l:%M %p', this.x);
          const cost = this.y;
          const totalGain = this.point && (this.point.totalGain ?? 0);
          const totalGainPctVal = this.point && this.point.totalGainPct;

const totalGainFormatted = formatCurrency(totalGain);
          
          const totalGainPctFormatted = (totalGainPctVal === null || totalGainPctVal === undefined)
            ? '—'
            : new Intl.NumberFormat(undefined, { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(totalGainPctVal);
          
          const costFormatted = formatCurrency(cost);
          
          let html = '<tr><th colspan="2"><strong>' + symbol + '</strong></th></tr>';
          if (accountName) {
            html += '<tr><th>Account:</th><td>' + accountName + '</td></tr>';
          }
          html += '<tr><th>Date:</th><td>' + date + '</td></tr>' +
                 '<tr><th>Gain:</th><td style="text-align: right">' + totalGainFormatted + '</td></tr>' +
                 '<tr><th>Gain Pct:</th><td style="text-align: right">' + totalGainPctFormatted + '</td></tr>' +
                 '<tr><th>Cost:</th><td style="text-align: right">' + costFormatted + '</td></tr>';
          return html;
        },
        footerFormat: '</table>',
        followPointer: true
      },
      legend: {
        enabled: true,
        align: 'center',
        verticalAlign: 'bottom',
        layout: 'horizontal',
        itemStyle: { color: '#c8c8c8' },
        itemHoverStyle: { color: '#fff' }
      },
      plotOptions: {
        bubble: {
          minSize: 15,
          maxSize: 100,
          dataLabels: {
            enabled: true,
            formatter: function(this: any): string {
              return this.series && this.series.name ? this.series.name : '';
            },
            style: {
              fontSize: '9px',
              fontWeight: 'normal',
              color: '#e8e8e8',
              textOutline: '1px #1a1a1a'
            }
          }
        }
      },
      series: series,
      credits: {
        enabled: false
      }
    };

    if (tradesChart) {
      try { tradesChart.destroy(); } catch (err) { }
    }
    tradesChart = Highcharts.chart(container, chartOptions);
  } else if (currentChartType === 'netGain') {
    const realizedPosData: any[] = [];
    const realizedNegData: any[] = [];
    const unrealizedPosData: any[] = [];
    const unrealizedNegData: any[] = [];
    const totalData: any[] = [];
    const realizedValues: Array<number | null> = [];
    const unrealizedValues: Array<number | null> = [];
    const categories: string[] = [];
    const accountNames: string[] = [];

    const gainColors = {
      realized: { positive: '#00c853', negative: '#ff4d4f' },
      unrealized: '#d9c38a',
      total: { positive: '#00c853', negative: '#ff4d4f' }
    };

    trades.forEach(row => {
      const totalGain = row.TotalGain ?? 0;
      const realized = row.RealizedGain ?? null;
      const unrealized = row.UnrealizedGain ?? null;
      const hasSplit = realized !== null && realized !== undefined && unrealized !== null && unrealized !== undefined;

      if (hasSplit) {
        realizedValues.push(realized);
        unrealizedValues.push(unrealized);

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
        realizedValues.push(null);
        unrealizedValues.push(null);
        realizedPosData.push({ y: null });
        realizedNegData.push({ y: null });
        unrealizedPosData.push({ y: null });
        unrealizedNegData.push({ y: null });
        totalData.push({
          y: totalGain,
          color: totalGain >= 0 ? gainColors.total.positive : gainColors.total.negative,
          sectionLabel: 'Total Gain'
        });
      }

      categories.push(row.Symbol || '');
      accountNames.push(row.AccountName || '');
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
        name: 'Total Gain',
        data: totalData,
        color: gainColors.total.positive
      });
    }

    if (series.length === 0 || categories.length === 0) {
      if (tradesChart) {
        try { tradesChart.destroy(); } catch (err) { }
        tradesChart = null;
      }
      renderNoChartData(container);
      return;
    }

    const chartOptions: any = {
      chart: {
        type: 'column',
        backgroundColor: 'transparent'
      },
      title: {
        text: 'Total Gain',
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
            fontSize: '10px',
            color: '#c8c8c8'
          }
        }
      },
      yAxis: {
        title: { text: 'Gain Amount' },
        reversedStacks: false,
        labels: {
          style: { color: '#c8c8c8' },
          formatter: function(this: any): string {
            return formatCurrency(this.value as number);
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
        useHTML: true,
        shared: false,
        formatter: function(this: any): string {
          const pointIndex = this.point ? this.point.index : 0;
          const symbol = categories[pointIndex] || '';
          const accountName = accountNames[pointIndex] || '';
          const seriesName = this.point && this.point.sectionLabel ? this.point.sectionLabel : (this.series && this.series.name ? this.series.name : '');

          const realizedVal = realizedValues[pointIndex] ?? null;
          const unrealizedVal = unrealizedValues[pointIndex] ?? null;
          const totalVal = totalData[pointIndex]?.y ?? null;
          const computedTotal = totalVal !== null && totalVal !== undefined
            ? totalVal
            : (realizedVal !== null || unrealizedVal !== null)
              ? (Number(realizedVal ?? 0) + Number(unrealizedVal ?? 0))
              : null;

          let html = '<table>' +
            '<tr><th colspan="2"><strong>' + symbol + '</strong></th></tr>';
          if (accountName) {
            html += '<tr><th>Account:</th><td>' + accountName + '</td></tr>';
          }
          const isTotalOnly = seriesName === 'Total Gain' && (realizedVal === null && unrealizedVal === null);
          if (!isTotalOnly && seriesName) {
            html += '<tr><th>' + seriesName + ':</th><td style="text-align: right">' + formatCurrency(this.y) + '</td></tr>';
          }
          if (computedTotal !== null) {
            const totalLabel = isTotalOnly ? 'Total Gain' : 'Total';
            html += '<tr><th>' + totalLabel + ':</th><td style="text-align: right">' + formatCurrency(computedTotal) + '</td></tr>';
          }
          html += '</table>';
          return html;
        },
        followPointer: true
      },
      legend: {
        enabled: true,
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

    if (tradesChart) {
      try { tradesChart.destroy(); } catch (err) { }
    }
    tradesChart = Highcharts.chart(container, chartOptions);
  } else if (currentChartType === 'distribution') {
    // Group trades by symbol or symbol group
    // Note: The Symbol field already contains the group name when groupBy='symbolGroup'
    const costByGroup: Map<string, number> = new Map();
    const valueByGroup: Map<string, number> = new Map();

    trades.forEach(row => {
      const key = row.Symbol || 'Unknown';
      const cost = row.CurrentCost || 0;
      const value = row.CurrentValue || 0;

      costByGroup.set(key, (costByGroup.get(key) || 0) + cost);
      valueByGroup.set(key, (valueByGroup.get(key) || 0) + value);
    });

    // Filter out non-positive values and prepare pie chart data
    const costData: any[] = [];
    costByGroup.forEach((value, key) => {
      if (value > 0) {
        costData.push({
          name: key,
          y: value
        });
      }
    });

    const valueData: any[] = [];
    valueByGroup.forEach((value, key) => {
      if (value > 0) {
        valueData.push({
          name: key,
          y: value
        });
      }
    });

    if (costData.length === 0 && valueData.length === 0) {
      if (tradesChart) {
        try { tradesChart.destroy(); } catch (err) { }
        tradesChart = null;
      }
      renderNoChartData(container);
      return;
    }

    // Create a container with two pie charts side by side
    container.innerHTML = '';
    container.style.display = 'flex';
    container.style.gap = '1rem';

    const costChartContainer = document.createElement('div');
    costChartContainer.id = 'trades-cost-pie-chart';
    costChartContainer.style.flex = '1';
    costChartContainer.style.minWidth = '0';

    const valueChartContainer = document.createElement('div');
    valueChartContainer.id = 'trades-value-pie-chart';
    valueChartContainer.style.flex = '1';
    valueChartContainer.style.minWidth = '0';

    container.appendChild(costChartContainer);
    container.appendChild(valueChartContainer);

    const commonPieOptions = {
      chart: {
        type: 'pie',
        backgroundColor: 'transparent'
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
      tooltip: {
        pointFormat: '<b>${point.y:,.2f}</b> ({point.percentage:.1f}%)'
      },
      credits: {
        enabled: false
      }
    };

    // Create Cost pie chart
    const costChartOptions = {
      ...commonPieOptions,
      title: {
        text: 'Current Cost Distribution',
        align: 'center',
        style: {
          fontSize: '1.1rem',
          fontWeight: '600',
          color: '#e8e8e8'
        }
      },
      series: [{
        name: 'Cost',
        colorByPoint: true,
        data: costData
      }]
    };

    // Create Value pie chart
    const valueChartOptions = {
      ...commonPieOptions,
      title: {
        text: 'Current Value Distribution',
        align: 'center',
        style: {
          fontSize: '1.1rem',
          fontWeight: '600',
          color: '#e8e8e8'
        }
      },
      series: [{
        name: 'Value',
        colorByPoint: true,
        data: valueData
      }]
    };

    if (tradesChart) {
      try { tradesChart.destroy(); } catch (err) { }
    }
    
    if (costData.length > 0) {
      Highcharts.chart(costChartContainer, costChartOptions);
    } else {
      renderNoChartData(costChartContainer);
    }

    if (valueData.length > 0) {
      Highcharts.chart(valueChartContainer, valueChartOptions);
    } else {
      renderNoChartData(valueChartContainer);
    }
  }
};


const renderStatsSection = (container: HTMLElement, trades: TradeRow[], asOf: string, closedState: ClosedState) => {
  const statsWrapper = document.createElement('div');
  statsWrapper.className = 'mb-4';
  
  if (trades.length === 0) {
    return;
  }
  
  // Calculate stats
  const totalTrades = trades.length;
  const winningTrades = trades.filter(t => t.WinningTrade === true).length;
  const losingTrades = trades.filter(t => t.WinningTrade === false).length;
  const knownOutcomes = winningTrades + losingTrades;
  const winningPercent = knownOutcomes > 0 ? (winningTrades / knownOutcomes * 100).toFixed(1) : '—';
  
  const longTrades = trades.filter(t => t.LongTrade).length;
  const shortTrades = totalTrades - longTrades;
  const longPercent = (longTrades / totalTrades * 100).toFixed(1);
  
  const durationValues = trades
    .map(t => t.DurationMS)
    .filter((d): d is string => d !== null && d !== undefined)
    .map(d => Number(d))
    .filter(n => !isNaN(n));
  const avgDurationMS = durationValues.length > 0 ? durationValues.reduce((s, v) => s + v, 0) / durationValues.length : null;
  const gainValues = trades
    .map(t => t.TotalGain)
    .filter((p): p is number => p !== null && p !== undefined);
  const totalGain = gainValues.reduce((s, v) => s + v, 0);
  const avgGain = gainValues.length > 0 ? totalGain / gainValues.length : null;
  const totalTotalFees = trades.reduce((sum, t) => sum + t.TotalFees, 0);
  
  // Calculate cost and value stats - treat null/undefined/NaN as 0 for totals
  const totalCost = trades.reduce((sum, t) => {
    const cost = Number(t.CurrentCost);
    return sum + (!isNaN(cost) ? cost : 0);
  }, 0);
  const totalValue = trades.reduce((sum, t) => {
    const value = Number(t.CurrentValue);
    return sum + (!isNaN(value) ? value : 0);
  }, 0);
  // For average, only include non-null, non-zero, non-NaN values
  const nonNullValues = trades.filter(t => {
    const value = Number(t.CurrentValue);
    return !isNaN(value) && value !== 0;
  });
  const avgTradeValue = nonNullValues.length > 0 ? totalValue / nonNullValues.length : 0;
  
  // Determine if overall profitable
  const isProfitable = totalGain > 0;

  // Stats section does not render quotes header anymore; it's rendered
  // alongside the toolbar so omit computing the max CurrentPriceDateTime here.
  
  const statsContent = document.createElement('div');
  statsContent.className = 'row g-3';
  
  // Format with safety checks for NaN
  const formatSafeCurrency = (value: number) => {
    return !isNaN(value) && isFinite(value) ? formatCurrency(value) : '$0.00';
  };
  
  // Conditionally include Open Trade Value card (hide if closedState is 'closed')
  const openTradeValueCard = closedState !== 'closed' ? `
    <div class="col-md-3">
      <div class="card border-0 shadow-sm h-100 stats-card">
        <div class="card-body text-center">
          <div class="stats-icon mb-2">💵</div>
          <h6 class="card-subtitle mb-2 text-muted text-uppercase small">Open Trade Value</h6>
          <h3 class="card-title mb-1 fw-bold">${formatSafeCurrency(totalValue)}</h3>
          <div class="small text-muted">Total Cost: ${formatSafeCurrency(totalCost)}</div>
          <div class="small text-muted">Avg Open Value: ${formatSafeCurrency(avgTradeValue)}</div>
        </div>
      </div>
    </div>
  ` : '';
  
  statsContent.innerHTML = `
    ${openTradeValueCard}
    <div class="col-md-3">
      <div class="card border-0 shadow-sm h-100 stats-card stats-card-${isProfitable ? 'success' : 'danger'}">
        <div class="card-body text-center">
          <div class="stats-icon mb-2">${isProfitable ? '💰' : '📉'}</div>
          <h6 class="card-subtitle mb-2 text-muted text-uppercase small">Total Gain</h6>
          <h3 class="card-title mb-1 fw-bold ${isProfitable ? 'text-success' : 'text-danger'}">${gainValues.length > 0 ? formatCurrency(totalGain) : '—'}</h3>
          <div class="small text-muted">Avg Gain: ${avgGain !== null ? formatCurrency(avgGain) : '—'}</div>
          <div class="small text-muted">Total Fees: ${formatCurrency(totalTotalFees)}</div>
        </div>
      </div>
    </div>
    <div class="col-md-3">
      <div class="card border-0 shadow-sm h-100 stats-card">
        <div class="card-body text-center">
          <div class="stats-icon mb-2">${knownOutcomes > 0 && parseFloat(winningPercent) >= 50 ? '🎯' : '⚠️'}</div>
          <h6 class="card-subtitle mb-2 text-muted text-uppercase small">Win Rate</h6>
          <h3 class="card-title mb-1 fw-bold">${winningPercent === '—' ? '—' : winningPercent + '%'}</h3>
          <div class="small text-muted">${winningTrades} winners / ${losingTrades} losers</div>
        </div>
      </div>
    </div>
    <div class="col-md-3">
      <div class="card border-0 shadow-sm h-100 stats-card">
        <div class="card-body text-center">
          <div class="stats-icon mb-2">📊</div>
          <h6 class="card-subtitle mb-2 text-muted text-uppercase small">Total Trades</h6>
          <h3 class="card-title mb-1 fw-bold">${totalTrades}</h3>
          <div class="small text-muted">${longTrades} Long / ${shortTrades} Short</div>
          <div class="small text-muted">${longPercent}% Long</div>
        </div>
      </div>
    </div>
  `;
  
  statsWrapper.appendChild(statsContent);
  container.appendChild(statsWrapper);
};

const renderToolbar = (
  container: HTMLElement,
  onRefreshQuotes: () => void,
  onImportTrades: () => void,
  accountId: number | null,
  brokerId: number | null,
  symbol: string | null,
  quotesAsOf: string | null,
  closedState: ClosedState,
  onClosedStateChange: (state: ClosedState) => void,
  groupBy: 'symbol' | 'symbolGroup',
  onGroupByChange: (groupBy: 'symbol' | 'symbolGroup') => void
) => {
  const toolbar = document.createElement('div');
  toolbar.className = 'btn-toolbar mb-3 flex-wrap flex-lg-nowrap gap-2 align-items-center';
  toolbar.setAttribute('role', 'toolbar');
  toolbar.setAttribute('aria-label', 'Trades toolbar');
  
  // Create Open/Closed/All button group
  const closedStateGroup = document.createElement('div');
  closedStateGroup.className = 'btn-group me-3';
  closedStateGroup.setAttribute('role', 'group');

  const openButton = document.createElement('button');
  openButton.type = 'button';
  openButton.id = 'trades-closed-state-open-btn';
  openButton.className = `btn btn-sm btn-outline-secondary${closedState === 'open' ? ' active' : ''}`;
  openButton.textContent = 'Open';
  openButton.addEventListener('click', () => onClosedStateChange('open'));

  const closedButton = document.createElement('button');
  closedButton.type = 'button';
  closedButton.id = 'trades-closed-state-closed-btn';
  closedButton.className = `btn btn-sm btn-outline-secondary${closedState === 'closed' ? ' active' : ''}`;
  closedButton.textContent = 'Closed';
  closedButton.addEventListener('click', () => onClosedStateChange('closed'));

  const allButton = document.createElement('button');
  allButton.type = 'button';
  allButton.id = 'trades-closed-state-all-btn';
  allButton.className = `btn btn-sm btn-outline-secondary${closedState === 'all' ? ' active' : ''}`;
  allButton.textContent = 'All';
  allButton.addEventListener('click', () => onClosedStateChange('all'));

  closedStateGroup.appendChild(openButton);
  closedStateGroup.appendChild(closedButton);
  closedStateGroup.appendChild(allButton);

  // Create a container for all left-aligned controls
  const leftContainer = document.createElement('div');
  leftContainer.className = 'd-flex align-items-center';

  leftContainer.appendChild(closedStateGroup);

  // Group the disabled label and date dropdown so they appear flush
  const closedDateGroup = document.createElement('div');
  closedDateGroup.className = 'btn-group me-3';
  closedDateGroup.setAttribute('role', 'group');

  const closedLabelBtn = document.createElement('button');
  closedLabelBtn.type = 'button';
  closedLabelBtn.className = 'btn btn-sm btn-outline-secondary rounded-end-0 border-end-0';
  // Do not set the native `disabled` attribute because it applies muted styling
  // instead use `aria-disabled` and pointer-events to prevent interaction while preserving color
  closedLabelBtn.setAttribute('aria-disabled', 'true');
  closedLabelBtn.tabIndex = -1; // prevent tab focus
  closedLabelBtn.style.pointerEvents = 'none';
  closedLabelBtn.style.opacity = '1';
  closedLabelBtn.style.fontSize = '0.875rem';
  closedLabelBtn.style.cursor = 'default';
  closedLabelBtn.textContent = 'Closed:';
  closedDateGroup.appendChild(closedLabelBtn);

  // Date range dropdown inside the grouped container for a flush look
  const dateRangeDropdownContainer = document.createElement('div');
  dateRangeDropdownContainer.className = 'btn-group';
  dateRangeDropdownContainer.id = 'trades-date-range-dropdown';
  
  const dateRangeButton = document.createElement('button');
  dateRangeButton.className = 'btn btn-sm btn-outline-secondary dropdown-toggle rounded-start-0 border-start-0 d-inline-flex align-items-center justify-content-between w-auto';
  dateRangeButton.type = 'button';
  dateRangeButton.setAttribute('data-bs-toggle', 'dropdown');
  dateRangeButton.setAttribute('aria-expanded', 'false');
  dateRangeButton.style.width = 'auto';
  dateRangeButton.style.minWidth = '0';
  
  const dateRangeLabel = document.createElement('span');
  dateRangeLabel.className = 'text-truncate me-2';
  dateRangeLabel.id = 'trades-date-range-label';
  dateRangeLabel.style.whiteSpace = 'nowrap';
  dateRangeLabel.textContent = 'Last 15 Days';
  dateRangeButton.appendChild(dateRangeLabel);
  
  const dateRangeMenu = document.createElement('div');
  dateRangeMenu.className = 'dropdown-menu p-0 shadow-sm';
  dateRangeMenu.style.width = '300px';
  dateRangeMenu.style.maxHeight = '400px';
  dateRangeMenu.style.overflowY = 'auto';
  
  const searchContainer = document.createElement('div');
  searchContainer.className = 'p-2 border-bottom sticky-top';
  searchContainer.style.backgroundColor = '#1f1f1f';
  searchContainer.style.borderBottomColor = '#454545';
  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.className = 'form-control form-control-sm';
  searchInput.placeholder = 'Search...';
  searchInput.id = 'trades-date-range-search';
  searchInput.style.backgroundColor = '#2d2d2d';
  searchInput.style.borderColor = '#454545';
  searchInput.style.color = '#e8e8e8';
  searchContainer.appendChild(searchInput);
  
  const listContainer = document.createElement('div');
  listContainer.id = 'trades-date-range-list';
  
  dateRangeMenu.appendChild(searchContainer);
  dateRangeMenu.appendChild(listContainer);
  
  // Place toggle and menu together in the same btn-group so they render flush
  dateRangeDropdownContainer.appendChild(dateRangeButton);
  dateRangeDropdownContainer.appendChild(dateRangeMenu);
  closedDateGroup.appendChild(dateRangeDropdownContainer);

  // Only display the closed date selector when the Closed or All filter is selected
  if (closedState !== 'open') {
    leftContainer.appendChild(closedDateGroup);
  }

  // Group By dropdown (new group before refresh quotes)
  const groupByGroup = document.createElement('div');
  groupByGroup.className = 'btn-group me-3';
  groupByGroup.setAttribute('role', 'group');

  const groupBySelect = document.createElement('select');
  groupBySelect.id = 'trades-group-by-select';
  groupBySelect.className = 'form-select form-select-sm';
  groupBySelect.style.width = 'auto';
  groupBySelect.style.minWidth = '120px';

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
  leftContainer.appendChild(groupByGroup);

  // Refresh quotes and resync brokers buttons
  const refreshQuotesButton = document.createElement('button');
  refreshQuotesButton.type = 'button';
  refreshQuotesButton.className = 'btn btn-sm btn-outline-secondary';
  refreshQuotesButton.innerHTML = '<i class="fa-solid fa-arrow-rotate-right" aria-hidden="true"></i> Quotes';
  refreshQuotesButton.title = 'Refresh Quotes';
  refreshQuotesButton.addEventListener('click', () => {
    if (typeof onRefreshQuotes === 'function') onRefreshQuotes();
  });

  const importTradesButton = document.createElement('button');
  importTradesButton.type = 'button';
  importTradesButton.className = 'btn btn-sm btn-outline-secondary';
  importTradesButton.innerHTML = '<i class="fa-solid fa-arrow-rotate-right" aria-hidden="true"></i> Orders';
  importTradesButton.title = 'Resync Orders';
  importTradesButton.addEventListener('click', onImportTrades);

  const groupC = document.createElement('div');
  groupC.className = 'btn-group';
  groupC.setAttribute('role', 'group');
  groupC.appendChild(refreshQuotesButton);
  groupC.appendChild(importTradesButton);
  leftContainer.appendChild(groupC);

  toolbar.appendChild(leftContainer);

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
  navTradesBtn.className = 'btn btn-sm btn-outline-secondary active';
  navTradesBtn.disabled = true;
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
  const statusEl = document.getElementById('trades-quotes-as-of');
  if (statusEl && quotesAsOf) {
    if (quotesAsOf.startsWith('Current quotes are not available')) {
      statusEl.textContent = quotesAsOf;
    } else {
      statusEl.textContent = `Quotes as of ${quotesAsOf}`;
    }
  }

  container.appendChild(toolbar);
  
  updateClosedStateButtonsUI(closedState);
};

// Update closed state buttons UI to reflect current closed state
const updateClosedStateButtonsUI = (closedState: ClosedState) => {
  const openBtn = document.getElementById('trades-closed-state-open-btn') as HTMLButtonElement | null;
  const closedBtn = document.getElementById('trades-closed-state-closed-btn') as HTMLButtonElement | null;
  const allBtn = document.getElementById('trades-closed-state-all-btn') as HTMLButtonElement | null;
  if (openBtn) openBtn.className = `btn btn-sm btn-outline-secondary${closedState === 'open' ? ' active' : ''}`;
  if (closedBtn) closedBtn.className = `btn btn-sm btn-outline-secondary${closedState === 'closed' ? ' active' : ''}`;
  if (allBtn) allBtn.className = `btn btn-sm btn-outline-secondary${closedState === 'all' ? ' active' : ''}`;
};



const renderTradesTable = (
  mountPoint: HTMLElement,
  trades: TradeRow[],
  asOf: string,
  sortState: SortState,
  longTradeFilter: LongTradeFilterValue,
  winningTradeFilter: WinningTradeFilterValue,
  accountId: number | null,
  brokerId: number | null,
  symbol: string | null,
  tradeId: number | null,
  dateRange: string,
  distinctSymbols: string[],
  onSort: (key: ColumnKey) => void,
  onLongTradeFilterChange: (filter: LongTradeFilterValue) => void,
  onWinningTradeFilterChange: (filter: WinningTradeFilterValue) => void,
  onAccountFilterChange: (accountId: number | null) => void,
  onBrokerIdChange: (brokerId: number | null) => void,
  onSymbolFilterChange: (symbol: string | null) => void,
  onTradeIdFilterChange: (tradeId: number | null) => void,
  onClosedStateChange: (state: ClosedState) => void,
  onResetFilters: () => void,
  onRefreshQuotes: () => void,
  onImportTrades: () => void,
  closedState: ClosedState,
  bookmarkBar: any,
  groupBy: 'symbol' | 'symbolGroup',
  onGroupByChange: (groupBy: 'symbol' | 'symbolGroup') => void,
  currentChartType: ChartType,
  onChartTypeChange: (type: ChartType) => void
) => {
  const wrapper = document.createElement('div');
  
  // Render stats section
  renderStatsSection(wrapper, trades, asOf, closedState);
  
  // Add chart wrapper (relative)
  const chartWrapper = document.createElement('div');
  chartWrapper.className = 'position-relative mb-3';
  wrapper.appendChild(chartWrapper);

  // Add chart dropdown (absolute)
  const dropdownContainer = document.createElement('div');
  dropdownContainer.className = 'position-absolute top-0 end-0 d-flex align-items-center gap-2 p-2';
  dropdownContainer.style.zIndex = '10';
  
  const chartSelect = document.createElement('select');
  chartSelect.className = 'form-select form-select-sm shadow-sm';
  chartSelect.style.width = 'auto';
  chartSelect.style.minWidth = '180px';
  
  const options: {value: ChartType, label: string}[] = [
    { value: 'gainVsCost', label: 'Gain vs Cost' },
    { value: 'netGain', label: 'Total Gain' },
    { value: 'distribution', label: 'Distribution' }
  ];
  
  options.forEach(opt => {
    const option = document.createElement('option');
    option.value = opt.value;
    option.textContent = opt.label;
    if (opt.value === currentChartType) {
      option.selected = true;
    }
    chartSelect.appendChild(option);
  });
  
  chartSelect.addEventListener('change', () => {
    onChartTypeChange(chartSelect.value as ChartType);
  });
  
  dropdownContainer.appendChild(chartSelect);
  chartWrapper.appendChild(dropdownContainer);
  
  // Add chart container
  const chartContainer = document.createElement('div');
  chartContainer.id = 'trades-chart-container';
  chartContainer.style.height = '400px';
  chartWrapper.appendChild(chartContainer);
  
  // Render toolbar with buttons
  // Prefer the server-provided quotes timestamp if available; otherwise
  // compute the most recent per-trade quote timestamp; finally fall back
  // to the API `asOf` snapshot if no quote timestamps exist.
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
  // `serverQuotesAsOf` may be provided by the server (ISO string)
  const serverQuotesAsOf = (mountPoint as any).__serverQuotesAsOf as string | null | undefined;
  if (serverQuotesAsOf) {
    const d = new Date(serverQuotesAsOf);
    if (!isNaN(d.getTime())) {
      quotesAsOfRendered = etFormatter.format(d);
    }
  }

  // If the server didn't provide a timestamp, try to infer from per-trade quote timestamps.
  if (!quotesAsOfRendered) {
    const quoteDateTimes: Date[] = trades
      .map((t: any) => t.CurrentPriceDateTime)
      .filter((dt: any) => dt !== null && dt !== undefined)
      .map((dt: string) => {
        const d = new Date(dt);
        return isNaN(d.getTime()) ? null : d;
      })
      .filter((d: Date | null): d is Date => d !== null);

    if (quoteDateTimes.length > 0) {
      const maxMs = Math.max(...quoteDateTimes.map(d => d.getTime()));
      const maxDate = new Date(maxMs);
      quotesAsOfRendered = etFormatter.format(maxDate);
    } else {
      // Do NOT fall back to the API snapshot time. Instead show a clear message
      // prompting the user to refresh quotes when none are available.
      quotesAsOfRendered = 'Current quotes are not available. Click Refresh Quotes.';
    }
  }

  const bookmarkContainer = document.createElement('div');
  wrapper.appendChild(bookmarkContainer);
  if (bookmarkBar) {
    bookmarkBar.render(bookmarkContainer);
  }

  renderToolbar(wrapper, onRefreshQuotes, onImportTrades, accountId, brokerId, symbol, quotesAsOfRendered, closedState, onClosedStateChange, groupBy, onGroupByChange);

  const table = document.createElement('table');
  table.className = 'table table-hover align-middle mb-0';
  table.style.borderCollapse = 'separate';
  table.style.borderSpacing = '0';

  const thead = document.createElement('thead');
  thead.style.background = 'linear-gradient(to bottom, #e8f5e9, #c8e6c9)';
  thead.style.position = 'sticky';
  thead.style.top = '0';
  thead.style.zIndex = '10';
  
  // Header row with sort controls
  const headerRow = document.createElement('tr');

  // Determine which columns are visible based on closedState:
  // - open: hide 'CloseDate' and 'DurationMS'
  // - closed: show all columns
  // - all/other: show all columns
  const visibleColumns = columns.filter((column) => {
    if (closedState === 'open') {
      return column.key !== 'CloseDate' && column.key !== 'DurationMS';
    }
    return true;
  });

  visibleColumns.forEach((column) => {
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
    label.textContent = column.label;
    // Allow Open/Close date and CurrentCost/CurrentValue header labels to render on two lines and avoid inner wrapping
    if (column.key === 'OpenDate' || column.key === 'CloseDate' || column.key === 'CurrentCost' || column.key === 'CurrentValue') {
      // Use 'pre-line' so intentional newlines are preserved but long words may still wrap
      headerCell.style.whiteSpace = 'pre-line';
      label.style.whiteSpace = 'pre-line';
      // Keep these columns compact: set a smaller minimum and a maximum width
      headerCell.style.minWidth = '90px';
      headerCell.style.maxWidth = '140px';
      label.style.display = 'inline-block';
    }
    // Align header content to the top to keep compact multi-line labels tidy
    headerCell.style.verticalAlign = 'top';
    // Center specific numeric headers to match cell alignment
    if (
      column.key === 'TradeID' ||
      column.key === 'CurrentCost' ||
      column.key === 'CurrentValue' ||
      column.key === 'TotalGain' ||
      column.key === 'TotalGainPct' ||
      column.key === 'TotalOrderCount' ||
      column.key === 'TotalFees'
    ) {
      headerCell.classList.add('text-center');
    }
    // Make TradeID column narrow
    if (column.key === 'TradeID') {
      headerCell.style.width = '70px';
      headerCell.style.minWidth = '60px';
      headerCell.style.maxWidth = '80px';
    }

    const indicator = document.createElement('span');
    indicator.className = 'sort-indicator text-muted';
    indicator.textContent = sortState.key === column.key ? (sortState.direction === 'asc' ? '▲' : '▼') : '';

    const activateSort = () => onSort(column.key);
    headerCell.addEventListener('click', activateSort);
    headerCell.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        activateSort();
      }
    });

    headerCell.appendChild(label);
    headerCell.appendChild(indicator);
    headerRow.appendChild(headerCell);
  });

  thead.appendChild(headerRow);

  // Filter row
  const filterRow = document.createElement('tr');
  
  visibleColumns.forEach((column) => {
    const filterCell = document.createElement('th');
    filterCell.scope = 'col';
    
    if (column.key === 'TradeID') {
      // TradeID filter input
      const input = document.createElement('input');
      input.type = 'number';
      input.className = 'form-control form-control-sm';
      input.placeholder = 'ID';
      input.style.width = '70px';
      if (tradeId !== null) {
        input.value = tradeId.toString();
      }
      input.addEventListener('change', () => {
        const val = input.value.trim();
        onTradeIdFilterChange(val ? parseInt(val, 10) : null);
      });
      filterCell.appendChild(input);
    }
    
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
    
    if (column.key === 'LongTrade') {
      const select = document.createElement('select');
      select.className = 'form-select form-select-sm';
      
      const options = ['All', 'Long', 'Short'];
      options.forEach(optionText => {
        const option = document.createElement('option');
        option.value = optionText.toLowerCase();
        option.textContent = optionText;
        if (option.value === longTradeFilter) {
          option.selected = true;
        }
        select.appendChild(option);
      });
      
      select.addEventListener('change', () => {
        onLongTradeFilterChange(select.value as LongTradeFilterValue);
      });
      
      filterCell.appendChild(select);
    }
    
    // Move the outcome filter into the TotalGain column's filter cell so the
    // Outcome column can be removed from the table while retaining filtering.
    if (column.key === 'TotalGain') {
      const select = document.createElement('select');
      select.className = 'form-select form-select-sm';

      const options = ['All', 'Win', 'Loss'];
      options.forEach(optionText => {
        const option = document.createElement('option');
        option.value = optionText.toLowerCase();
        option.textContent = optionText;
        if (option.value === winningTradeFilter) {
          option.selected = true;
        }
        select.appendChild(option);
      });

      select.addEventListener('change', () => {
        onWinningTradeFilterChange(select.value as WinningTradeFilterValue);
      });

      filterCell.appendChild(select);
    }
    
    filterRow.appendChild(filterCell);
  });

  thead.appendChild(filterRow);

  const tbody = document.createElement('tbody');
  trades.forEach((row) => {
    const tr = document.createElement('tr');
    if (row.TradeID !== null && row.TradeID !== undefined) {
      tr.dataset.tradeId = String(row.TradeID);
    }

    visibleColumns.forEach((column) => {
      const cell = document.createElement('td');
      
      // Highlight TotalGain columns based on winning/losing trade
      if (column.key === 'TotalGain' || column.key === 'TotalGainPct') {
        if (row.WinningTrade === true) {
          cell.classList.add('cell-win-bg');
        } else if (row.WinningTrade === false) {
          cell.classList.add('cell-loss-bg');
        } else {
          // leave neutral for open/unknown trades
        }
      }
      
      // Center numeric columns
      if (
        column.key === 'TradeID' ||
        column.key === 'OpenQuantity' ||
        column.key === 'CurrentCost' ||
        column.key === 'CurrentValue' ||
        column.key === 'BreakEvenPrice' ||
        column.key === 'CurrentPrice' ||
        column.key === 'TotalGain' ||
        column.key === 'TotalGainPct' ||
        column.key === 'TotalOrderCount' ||
        column.key === 'TotalFees'
      ) {
        cell.classList.add('text-center');
      } else {
        // Left-align all other columns explicitly
        cell.classList.add('text-start');
      }
      
      const rawValue = (row as any)[column.key];
      const displayValue = column.formatter ? column.formatter(row) : (rawValue === null || rawValue === undefined ? '—' : String(rawValue));
      
      // Make TradeID column narrow
      if (column.key === 'TradeID') {
        cell.style.width = '70px';
        cell.style.minWidth = '60px';
        cell.style.maxWidth = '80px';
      }
      
      // For Open/Close/CurrentCost/CurrentValue cells: preserve the intended newline and avoid internal wrapping
      if (column.key === 'OpenDate' || column.key === 'CloseDate' || column.key === 'CurrentCost' || column.key === 'CurrentValue') {
        cell.style.whiteSpace = 'pre-line';
        cell.style.minWidth = '70px';
        cell.style.maxWidth = '140px';
        cell.style.overflowWrap = 'anywhere';
      }

      // Align cell content to the top to match header alignment
      cell.style.verticalAlign = 'top';

      // Render TradeID with OPEN/CLOSED badge and make it clickable
      if (column.key === 'TradeID') {
        const wrapperDiv = document.createElement('div');
        const tradeIdDiv = document.createElement('div');
        
        // Make TradeID a clickable link to tradeHistory page (to navigate back)
        if (row.TradeID) {
          const link = document.createElement('a');
          link.href = `/tradeHistory?tradeId=${row.TradeID}`;
          link.className = 'text-decoration-none';
          link.style.color = 'inherit';
          link.textContent = displayValue;
          tradeIdDiv.appendChild(link);
        } else {
          tradeIdDiv.textContent = displayValue;
        }
        wrapperDiv.appendChild(tradeIdDiv);

        // Add OPEN or CLOSED badge below trade ID
        const badgeDiv = document.createElement('div');
        const badge = document.createElement('span');
        badge.style.border = '1px solid rgba(0,0,0,0.05)';
        if (row.Closed === false) {
          badge.className = 'badge mt-1 badge-open';
          badge.textContent = 'OPEN';
        } else {
          badge.className = 'badge mt-1 badge-closed';
          badge.textContent = 'CLOSED';
        }
        badgeDiv.appendChild(badge);
        wrapperDiv.appendChild(badgeDiv);

        cell.appendChild(wrapperDiv);
      } else if (column.key === 'Symbol') {
        cell.textContent = displayValue;
      } else if (column.key === 'AccountID') {
        const wrapperDiv = document.createElement('div');
        const accountDiv = document.createElement('div');
        
        // Make AccountID a clickable link if we have the ID
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
      } else if (column.key === 'TotalOrderCount' && row.TradeID) {
        // Make TotalOrderCount cell a clickable link
        const link = document.createElement('a');
        link.href = `/orders?tradeId=${row.TradeID}`;
        link.className = 'text-decoration-none';
        link.style.color = 'inherit';
        link.textContent = displayValue;
        cell.appendChild(link);
      } else if (column.key === 'CurrentCost' || column.key === 'CurrentValue') {
        const wrapperDiv = document.createElement('div');
        wrapperDiv.style.display = 'flex';
        wrapperDiv.style.flexDirection = 'column';
        wrapperDiv.style.alignItems = 'center';
        wrapperDiv.style.justifyContent = 'center';
        
        const isClosedTrade = row.Closed === true;
        const avgEntryAvailable = row.AvgEntryPrice !== null && row.AvgEntryPrice !== undefined;
        const avgExitAvailable = row.AvgExitPrice !== null && row.AvgExitPrice !== undefined;
        const showClosedFormat = isClosedTrade && (
          (column.key === 'CurrentCost' && avgEntryAvailable) ||
          (column.key === 'CurrentValue' && avgExitAvailable)
        );

        const shouldShowDash = !showClosedFormat && (
          row.OpenQuantity === 0 ||
          (column.key === 'CurrentCost' && (row.CurrentCost === null || row.CurrentCost === undefined || row.CurrentCost === 0)) ||
          (column.key === 'CurrentValue' && (row.CurrentValue === null || row.CurrentValue === undefined || row.CurrentValue === 0))
        );

        if (showClosedFormat) {
          // First line: "Closed"
          const closedDiv = document.createElement('div');
          closedDiv.style.whiteSpace = 'nowrap';
          closedDiv.textContent = 'Closed';
          wrapperDiv.appendChild(closedDiv);

          // Second line: different for Cost vs Value
          const secondLineDiv = document.createElement('div');
          secondLineDiv.style.fontSize = '0.75rem';
          secondLineDiv.style.fontStyle = 'italic';
          secondLineDiv.style.color = 'rgba(255, 255, 255, 0.6)';
          secondLineDiv.style.marginTop = '2px';
          secondLineDiv.style.whiteSpace = 'nowrap';
          
          if (column.key === 'CurrentCost') {
            // Show "Risked: (LargestRisk)"
            secondLineDiv.textContent = `Risked: ${formatCurrency(row.LargestRisk ?? 0)}`;
          } else {
            // Show "Reward/Risk: (Gain / LargestRisk as %)"
            const gain = row.TotalGain ?? 0;
            const risk = row.LargestRisk ?? 1; // Avoid division by zero
            const rewardRiskRatio = risk !== 0 ? (gain / risk) * 100 : 0;
            const formattedRatio = Math.round(rewardRiskRatio);
            secondLineDiv.textContent = `Reward/Risk: ${formattedRatio}%`;
          }
          wrapperDiv.appendChild(secondLineDiv);

          // Third line: Avg price label
          const priceDiv = document.createElement('div');
          priceDiv.style.fontSize = '0.75rem';
          priceDiv.style.fontStyle = 'italic';
          priceDiv.style.color = 'rgba(255, 255, 255, 0.6)';
          priceDiv.style.whiteSpace = 'nowrap';
          
          if (column.key === 'CurrentCost') {
            const label = row.LongTrade ? 'Avg Buy' : 'Avg Short';
            priceDiv.textContent = `${label}: ${formatCurrency(row.AvgEntryPrice ?? 0)}`;
          } else {
            const label = row.LongTrade ? 'Avg Sell' : 'Avg Cover';
            priceDiv.textContent = `${label}: ${formatCurrency(row.AvgExitPrice ?? 0)}`;
          }
          wrapperDiv.appendChild(priceDiv);
        } else {
          // First line: the cost/value amount (or dash if 0/null or OpenQuantity is 0)
          const amountDiv = document.createElement('div');
          amountDiv.style.whiteSpace = 'nowrap';
          const amount = shouldShowDash
            ? '—'
            : column.key === 'CurrentCost' 
              ? formatCurrency(row.CurrentCost)
              : formatCurrency(row.CurrentValue);
          amountDiv.textContent = amount;
          wrapperDiv.appendChild(amountDiv);
        }

        // Add detail line below the amount for open trades
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
          
          if (column.key === 'CurrentCost') {
            // Show OpenQuantity @ BreakEvenPrice
            if (row.OpenQuantity && row.BreakEvenPrice !== null && row.BreakEvenPrice !== undefined && row.BreakEvenPrice !== 0) {
              const textSpan = document.createElement('span');
              textSpan.textContent = `${formatQuantity(row.OpenQuantity)} @ ${formatCurrency(row.BreakEvenPrice)}`;
              detailDiv.appendChild(textSpan);
              wrapperDiv.appendChild(detailDiv);
            }
          } else {
            // Show OpenQuantity @ CurrentPrice
            if (row.OpenQuantity && row.CurrentPrice !== null && row.CurrentPrice !== undefined && row.CurrentPrice !== 0) {
              const textSpan = document.createElement('span');
              textSpan.textContent = `${formatQuantity(row.OpenQuantity)} @ ${formatCurrency(row.CurrentPrice)}`;
              detailDiv.appendChild(textSpan);
              wrapperDiv.appendChild(detailDiv);
            }
          }
        }

        // Tooltip icon: show contextual values, but omit any null fields
        const tooltipLines: string[] = [];
        let shouldShowTooltip = false;
        
        if (!showClosedFormat) {
          if (column.key === 'CurrentCost') {
            // Only show tooltip if BreakEvenPrice is different from AvgEntryPrice
            const breakEven = row.BreakEvenPrice ?? 0;
            const avgEntry = row.AvgEntryPrice ?? 0;
            const isDifferent = Math.abs(breakEven - avgEntry) > 0.01; // Use small tolerance for floating point comparison
            
            if (isDifferent) {
              if (
                row.OpenQuantity > 0 &&
                row.BreakEvenPrice !== null &&
                row.BreakEvenPrice !== undefined &&
                row.BreakEvenPrice !== 0
              ) {
                tooltipLines.push(
                  `<div class="tooltip-line"><strong>Breakeven:</strong> ${formatCurrency(row.BreakEvenPrice)}</div>`
                );
                shouldShowTooltip = true;
              }
              if (row.AvgEntryPrice !== null && row.AvgEntryPrice !== undefined && row.AvgEntryPrice !== 0) {
                const entryLabel = row.LongTrade ? 'Avg Buy Price' : 'Avg Sell Short Price';
                tooltipLines.push(`<div class="tooltip-line"><strong>${entryLabel}:</strong> ${formatCurrency(row.AvgEntryPrice)}</div>`);
              }
            }
          } else {
            // Only show tooltip if we have AvgExitPrice to show in addition to CurrentPrice
            const avgExit = row.AvgExitPrice ?? null;
            const hasAvgExit = avgExit !== null && avgExit !== 0;
            
            if (hasAvgExit) {
              if (row.CurrentPrice !== null && row.CurrentPrice !== undefined && row.CurrentPrice !== 0) {
                tooltipLines.push(
                  `<div class="tooltip-line"><strong>Current Price:</strong> ${formatCurrency(row.CurrentPrice)}</div>`
                );
              }
              const exitLabel = row.LongTrade ? 'Avg Sell Price' : 'Avg Buy to Cover Price';
              tooltipLines.push(`<div class="tooltip-line"><strong>${exitLabel}:</strong> ${formatCurrency(avgExit)}</div>`);
              shouldShowTooltip = true;
            }
          }
        }

        if (shouldShowTooltip && tooltipLines.length > 0 && !showClosedFormat && !shouldShowDash) {
          // Find the detailDiv that was just created and append the icon to it
          const detailDiv = wrapperDiv.lastChild as HTMLElement;
          if (detailDiv && detailDiv.tagName === 'DIV') {
            const info = document.createElement('i');
            info.className = 'fa-solid fa-circle-info text-muted';
            // Use Bootstrap HTML tooltip; set HTML content via title and enable html
            info.setAttribute('data-bs-toggle', 'tooltip');
            info.setAttribute('data-bs-html', 'true');
            // Join without extra spacing since each line is a block with no margin
            info.setAttribute('title', tooltipLines.join(''));
            info.style.cursor = 'pointer';
            info.style.fontSize = '0.65rem';
            info.style.lineHeight = '1';
            detailDiv.appendChild(info);
          }
        } else if (shouldShowTooltip && tooltipLines.length > 0) {
          const info = document.createElement('i');
          info.className = 'fa-solid fa-circle-info ms-2 text-muted';
          // Use Bootstrap HTML tooltip; set HTML content via title and enable html
          info.setAttribute('data-bs-toggle', 'tooltip');
          info.setAttribute('data-bs-html', 'true');
          // Join without extra spacing since each line is a block with no margin
          info.setAttribute('title', tooltipLines.join(''));
          info.style.cursor = 'pointer';
          info.style.fontSize = '0.65rem';
          info.style.lineHeight = '1';
          wrapperDiv.appendChild(info);
        }

        cell.appendChild(wrapperDiv);
      } else if (column.key === 'TotalGain') {
        const gainValue = row.TotalGain ?? 0;

        if (gainValue === 0) {
          cell.textContent = '—';
          tr.appendChild(cell);
          return;
        }

        // Show gain amount and tooltip when realized/unrealized are not both zero
        const mainWrapperDiv = document.createElement('div');
        mainWrapperDiv.style.display = 'flex';
        mainWrapperDiv.style.flexDirection = 'column';
        mainWrapperDiv.style.alignItems = 'center';
        mainWrapperDiv.style.justifyContent = 'center';

        const realized = row.RealizedGain ?? 0;
        const unrealized = row.UnrealizedGain ?? 0;
        const total = row.TotalGain ?? 0;
        const gainClass = (value: number): string => {
          const rounded = Math.round(value * 100) / 100;
          return rounded > 0 ? 'gain-positive' : (rounded < 0 ? 'gain-negative' : '');
        };
        const realizedCls = gainClass(realized);
        const unrealizedCls = gainClass(unrealized);
        const totalCls = gainClass(total);

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
        if (realized !== null && realized !== undefined && realized !== 0) {
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
        if (realized !== null && realized !== undefined && realized !== 0) {
          // Amount and percentage line
          const amountDiv = document.createElement('div');
          amountDiv.style.fontSize = '0.75rem';
          amountDiv.style.fontStyle = 'italic';
          amountDiv.style.color = 'rgba(255, 255, 255, 0.6)';
          amountDiv.style.marginTop = '2px';
          amountDiv.style.whiteSpace = 'nowrap';
          amountDiv.style.textAlign = 'center';
          
          // Calculate percentage of total gain
          let percentText = '';
          if (Math.abs(realized) + Math.abs(unrealized) !== 0) {
            const [percent] = computeTwoPartPercentages(realized, unrealized);
            percentText = ` (${percent}%)`;
          }
          
          // Round to nearest whole number and format without decimals
          const roundedRealized = Math.round(realized);
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

        cell.appendChild(mainWrapperDiv);
      } else {
        cell.textContent = displayValue;
      }
      tr.appendChild(cell);
    });

    tbody.appendChild(tr);
  });

  table.appendChild(thead);
  table.appendChild(tbody);
  wrapper.appendChild(table);
  ensureRenderRowCount(wrapper, trades.length);

  mountPoint.innerHTML = '';
  mountPoint.appendChild(wrapper);

  // Initialize Bootstrap HTML tooltips for this trades table (page-local)
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
  
  initializeOrUpdateChart(trades, groupBy);
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

const fetchTradesData = async (
  sort: SortState,
  longTradeFilter: LongTradeFilterValue,
  winningTradeFilter: WinningTradeFilterValue,
  accountId: number | null,
  brokerId: number | null,
  symbol: string | null,
  tradeId: number | null,
  dateRange: string,
  closedState: ClosedState = 'all',
  groupBy: 'symbol' | 'symbolGroup' = 'symbol'
): Promise<TradesApiResponse> => {
  const params = new URLSearchParams({
    sortKey: sort.key,
    sortDirection: sort.direction,
    longTradeFilter: longTradeFilter,
    winningTradeFilter: winningTradeFilter,
    dateRange: dateRange,
    groupBy: groupBy
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

  if (closedState && closedState !== 'all') {
    params.set('closedState', closedState);
  }

  const response = await fetch(`${REQUEST_ENDPOINT}?${params.toString()}`, {
    headers: {
      Accept: 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to load trades (${response.status})`);
  }

  return response.json() as Promise<TradesApiResponse>;
};

const setLoadingState = (mountPoint: HTMLElement, message: string = 'Loading Trades...') => {
  mountPoint.innerHTML = `
    <div class="text-center py-5">
      <div class="spinner-border spinner-border-sm text-secondary me-2" role="status"></div>
      <span class="fs-5 text-muted align-middle">${message}</span>
    </div>
  `;
};

const DEFAULT_SORT: SortState = { key: 'TradeID', direction: 'desc' };
const DEFAULT_LONG_TRADE_FILTER: LongTradeFilterValue = 'all';
const DEFAULT_WINNING_TRADE_FILTER: WinningTradeFilterValue = 'all';
const DEFAULT_DATE_RANGE = 'LAST_15_DAYS';
const DEFAULT_CLOSED_STATE: ClosedState = 'open';
const DEFAULT_GROUP_BY: 'symbol' | 'symbolGroup' = 'symbol';

const initializeTradesTable = (mountPoint: HTMLElement) => {
  // Check for query string parameters (for cross-linking)
  const urlParams = new URLSearchParams(window.location.search);
  const tradeIdParam = urlParams.get('tradeId');
  const accountIdParam = urlParams.get('accountId');
  
  // Initialize with defaults
  let sort = DEFAULT_SORT;
  let longTradeFilter = DEFAULT_LONG_TRADE_FILTER;
  let winningTradeFilter = DEFAULT_WINNING_TRADE_FILTER;
  let accountId: number | null = null;
  let symbol: string | null = null;
  let tradeId: number | null = null;
  let dateRange = DEFAULT_DATE_RANGE;
  let closedState: ClosedState = DEFAULT_CLOSED_STATE;
  let brokerId: number | null = null;
  let groupBy: 'symbol' | 'symbolGroup' = DEFAULT_GROUP_BY;
  
  // If tradeId is in query string, override defaults
  if (tradeIdParam) {
    const parsedTradeId = parseInt(tradeIdParam, 10);
    if (!isNaN(parsedTradeId) && parsedTradeId > 0) {
      tradeId = parsedTradeId;
      // When navigating from Trade History, show both Open and Closed trades
      closedState = 'all';
    }
  }

  // If accountId is in query string (coming from cross-page navigation),
  // reset all other filters except the account filter. Support 'all' to clear the account filter.
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
    trades: TradeRow[];
    asOf: string;
    sort: SortState;
    longTradeFilter: LongTradeFilterValue;
    winningTradeFilter: WinningTradeFilterValue;
    accountId: number | null;
    symbol: string | null;
    tradeId: number | null;
    dateRange: string;
    distinctSymbols: string[];
    closedState: ClosedState;
    brokerId: number | null;
    groupBy: 'symbol' | 'symbolGroup';
  currentChartType: ChartType;
  } = {
    trades: [],
    asOf: '',
    sort,
    longTradeFilter,
    winningTradeFilter,
    accountId,
    symbol,
    tradeId,
    dateRange,
    closedState,
    distinctSymbols: [],
    brokerId,
    groupBy,
    // Track the current chart type in state so the BookmarkBar can persist it
    currentChartType: currentChartType
  };

  // Initialize date range dropdown
  let dateRangeDropdown: any = null;
  const initDateRangeDropdown = () => {
    if (!(window as any).DateRangeDropdown) {
      console.warn('[tradesClient] DateRangeDropdown not available');
      return;
    }
    dateRangeDropdown = new (window as any).DateRangeDropdown({
      containerId: 'trades-date-range-dropdown',
      searchInputId: 'trades-date-range-search',
      listContainerId: 'trades-date-range-list',
      labelElementId: 'trades-date-range-label',
      milestones: MILESTONES,
      defaultValue: state.dateRange,
      accountId: state.accountId,
      onChange: (value: string) => {
        console.log('[tradesClient] Date range changed to:', value);
        bookmarkBar.clearSelection();
        state.dateRange = value;
        void load();
      }
    });
  };

  const handleResetFilters = () => {
    state.longTradeFilter = 'all';
    state.winningTradeFilter = 'all';
    state.accountId = null;
    state.brokerId = null;
    state.symbol = null;
    state.tradeId = null;
    state.dateRange = 'LAST_15_DAYS';
    state.closedState = 'open';
    state.sort = DEFAULT_SORT;
    state.groupBy = 'symbol';
    // Reset chart type to default (Gain vs Cost)
    state.currentChartType = 'gainVsCost';
    currentChartType = 'gainVsCost';
    if (dateRangeDropdown) {
      dateRangeDropdown.setAccountId(null);
      dateRangeDropdown.setValue('LAST_15_DAYS');
    }
    void load(DEFAULT_SORT);
  };

  const bookmarkBar = new (window as any).BookmarkBar(
    'TradeViewState',
    (savedState: any) => {
      state.sort = savedState.sort;
      state.longTradeFilter = savedState.longTradeFilter;
      state.winningTradeFilter = savedState.winningTradeFilter;
      state.accountId = savedState.accountId;
      state.brokerId = savedState.brokerId;
      state.symbol = savedState.symbol;
      state.tradeId = savedState.tradeId;
      state.dateRange = savedState.dateRange || 'LAST_15_DAYS';
      state.closedState = savedState.closedState;
      state.groupBy = savedState.groupBy || 'symbol';
      // Restore chart type when available in saved state, with fallback to default
      const restoredChartType = savedState.chartType || state.currentChartType || 'gainVsCost';
      state.currentChartType = validChartTypes.includes(restoredChartType) ? restoredChartType : 'gainVsCost';
      currentChartType = state.currentChartType;
      if (dateRangeDropdown) {
        dateRangeDropdown.setAccountId(state.accountId);
        dateRangeDropdown.setValue(state.dateRange);
      }
      void load();
    },
    () => {
      return {
        sort: state.sort,
        longTradeFilter: state.longTradeFilter,
        winningTradeFilter: state.winningTradeFilter,
        accountId: state.accountId,
        brokerId: state.brokerId,
        symbol: state.symbol,
        tradeId: state.tradeId,
        dateRange: state.dateRange,
        closedState: state.closedState,
        groupBy: state.groupBy,
        // Persist the selected chart type in bookmarks
        chartType: currentChartType
      };
    },
    handleResetFilters,
    (window as any).LUMOS_DEMO_MODE || false
  );

  const handleSort = (columnKey: ColumnKey) => {
    bookmarkBar.clearSelection();
    const nextSort: SortState =
      state.sort.key === columnKey
        ? {
            key: columnKey,
            direction: state.sort.direction === 'asc' ? 'desc' : 'asc'
          }
        : { key: columnKey, direction: 'asc' };

    void load(nextSort);
  };

  const handleLongTradeFilterChange = (filter: LongTradeFilterValue) => {
    bookmarkBar.clearSelection();
    state.longTradeFilter = filter;
    void load();
  };

  const handleClosedStateChange = (newState: ClosedState) => {
    bookmarkBar.clearSelection();
    state.closedState = newState;
    void load();
  };

  const handleWinningTradeFilterChange = (filter: WinningTradeFilterValue) => {
    bookmarkBar.clearSelection();
    state.winningTradeFilter = filter;
    void load();
  };

  const handleAccountFilterChange = (accountId: number | null) => {
    bookmarkBar.clearSelection();
    state.accountId = accountId;
    state.brokerId = null;
    if (dateRangeDropdown) {
      dateRangeDropdown.setAccountId(accountId);
    }
    void load();
  };

  const handleBrokerIdChange = (brokerId: number | null) => {
    bookmarkBar.clearSelection();
    state.brokerId = brokerId;
    state.accountId = null;
    if (dateRangeDropdown) {
      dateRangeDropdown.setAccountId(null);
    }
    void load();
  };

  const handleSymbolFilterChange = (symbol: string | null) => {
    bookmarkBar.clearSelection();
    state.symbol = symbol;
    void load();
  };

  const handleTradeIdFilterChange = (tradeId: number | null) => {
    bookmarkBar.clearSelection();
    state.tradeId = tradeId;
    void load();
  };

  const handleGroupByChange = (groupBy: 'symbol' | 'symbolGroup') => {
    bookmarkBar.clearSelection();
    state.groupBy = groupBy;
    void load();
  };

  const handleImportTrades = async () => {
    try {
      setLoadingState(mountPoint, 'Resynchronizing Brokers...');
      const response = await fetch('/request/importTrades', { method: 'POST' });
      const result = await response.json();
      await load(); // Reload the data
      if (!result.success && result.error) {
        (window as any).LumosErrorUtils.displayDismissibleError(mountPoint, result.error, 'Resync Orders completed with errors');
      }
    } catch (error) {
      console.error('Resynchronizing brokers (trades) error:', error);
      await load(); // Reload to show current state
    }
  };

  const handleRefreshQuotes = async () => {
    try {
      setLoadingState(mountPoint, 'Refreshing Quotes...');
      const response = await fetch('/request/importQuotes', { method: 'POST' });
      const result = await response.json();
      await load(); // Reload the data with existing filters
      if (!result.success && result.error) {
        (window as any).LumosErrorUtils.displayDismissibleError(mountPoint, result.error, 'Refresh Quotes completed with errors');
      } else if (result.refreshErrors) {
        (window as any).LumosErrorUtils.displayDismissibleError(mountPoint, result.refreshErrors, 'Refresh Quotes completed with errors');
      }
    } catch (error) {
      console.error('Refresh quotes error:', error);
      await load();
    }
  };

  const load = async (sortOverride?: SortState) => {
    const sortToUse = sortOverride ?? state.sort ?? DEFAULT_SORT;
    state.sort = sortToUse;
    let loadingTimer: number | null = window.setTimeout(() => setLoadingState(mountPoint), 250);
    try {
      const data = await fetchTradesData(
        sortToUse,
        state.longTradeFilter,
        state.winningTradeFilter,
        state.accountId,
        state.brokerId,
        state.symbol,
        state.tradeId,
        state.dateRange,
        state.closedState,
        state.groupBy
      );
      
      if (loadingTimer) { clearTimeout(loadingTimer); loadingTimer = null; }
      state.trades = data.trades;
      state.asOf = data.asOf;
      
      const symbolSet = new Set<string>();
      data.trades.forEach(trade => {
        if (trade.Symbol) {
          symbolSet.add(trade.Symbol);
        }
      });
      state.distinctSymbols = Array.from(symbolSet).sort();
      
      (mountPoint as any).__serverQuotesAsOf = (data as any).quotesAsOf ?? null;

      renderTradesTable(
        mountPoint,
        state.trades,
        state.asOf,
        state.sort,
        state.longTradeFilter,
        state.winningTradeFilter,
        state.accountId,
        state.brokerId,
        state.symbol,
        state.tradeId,
        state.dateRange,
        state.distinctSymbols,
        handleSort,
        handleLongTradeFilterChange,
        handleWinningTradeFilterChange,
        handleAccountFilterChange,
        handleBrokerIdChange,
        handleSymbolFilterChange,
        handleTradeIdFilterChange,
        handleClosedStateChange,
        handleResetFilters,
        handleRefreshQuotes,
        handleImportTrades,
        state.closedState,
        bookmarkBar,
        state.groupBy,
        handleGroupByChange,
        currentChartType,
        (type: ChartType) => {
          // Persist selection in both state and global var, clear bookmark selection,
          // and update the chart in-place without refetching data.
          bookmarkBar.clearSelection();
          state.currentChartType = type;
          currentChartType = type;
          try {
            initializeOrUpdateChart(state.trades, state.groupBy);
          } catch (err) {
            // Fallback to a full reload if the chart update fails
            console.error('[tradesClient] Failed to update chart in place, reloading', err);
            void load();
          }
        }
      );
      
      setTimeout(() => initDateRangeDropdown(), 0);
    } catch (error) {
      if (loadingTimer) { clearTimeout(loadingTimer); loadingTimer = null; }
      console.error('[tradesClient] Failed to render trades table', error);
      renderError(mountPoint, 'Unable to load trades right now. Please try again later.');
    }
  };

  void load(state.sort);
  
  // Return load and reset functions for external use
  return { load, resetFilters: handleResetFilters };
};

document.addEventListener('DOMContentLoaded', () => {
  const mountPoint = document.querySelector<HTMLElement>('[data-trades-table-root]');
  if (!mountPoint) {
    return;
  }

  const { load: reloadFn, resetFilters } = initializeTradesTable(mountPoint);
  
  const tradesTitle = document.getElementById('trades-title');
  if (tradesTitle) {
    tradesTitle.addEventListener('click', () => {
      resetFilters();
    });
  }
});


