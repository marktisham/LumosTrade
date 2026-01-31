export function getHomeData(bookmarks: any = {}) {
  return {
    title: 'Lumos Trade',
    message: 'Illuminate your trading performance.',
    sections: [
      {
        id: 'accounts',
        title: 'Accounts',
        icon: 'fa-solid fa-wallet',
        description: 'Track your current balances and historical trends.',
        cards: [
          {
            url: '/accounts',
            label: 'Account Balances',
            description: 'View current balances of your accounts.',
            icon: 'fa-solid fa-wallet',
            primary: true,
            shortcuts: (bookmarks.accounts || []).map((b: any) => ({
              label: b.name,
              url: `/accounts?bookmark=${encodeURIComponent(b.name)}`
            }))
          },
          {
            url: '/accountHistory',
            label: 'Account History',
            description: 'Track the value of your accounts over time.',
            icon: 'fa-solid fa-chart-area',
            primary: false,
            shortcuts: (bookmarks.accountHistory || []).map((b: any) => ({
              label: b.name,
              url: `/accountHistory?bookmark=${encodeURIComponent(b.name)}`
            }))
          }
        ]
      },
      {
        id: 'trades',
        title: 'Trades',
        icon: 'fa-solid fa-chart-line',
        description: 'View current positions and historical performance.',
        cards: [
          {
            url: '/trades',
            label: 'Open Trades',
            description: 'View the current status of your open trades.',
            icon: 'fa-solid fa-magnifying-glass-chart',
            primary: true,
            shortcuts: (bookmarks.trades || []).map((b: any) => ({
              label: b.name,
              url: `/trades?bookmark=${encodeURIComponent(b.name)}`
            }))
          },
          {
            url: '/tradeHistory',
            label: 'Trade History',
            description: 'View the profit and loss of your trades over time.',
            icon: 'fa-solid fa-clock-rotate-left',
            primary: false,
            shortcuts: (bookmarks.tradeHistory || []).map((b: any) => ({
              label: b.name,
              url: `/tradeHistory?bookmark=${encodeURIComponent(b.name)}`
            }))
          },
          {
            url: '/orders',
            label: 'Order History',
            description: 'View historical orders from the broker.',
            icon: 'fa-solid fa-list-check',
            primary: false,
            shortcuts: (bookmarks.orders || []).map((b: any) => ({
              label: b.name,
              url: `/orders?bookmark=${encodeURIComponent(b.name)}`
            }))
          }
        ]
      },
      {
        id: 'tools',
        icon: 'fa-solid fa-tools',
        title: 'Tools',
        description: 'Analysis and calculation tools for trading.',
        cards: [
          {
            url: '/expectedMoves',
            label: 'Expected Moves',
            description: 'View expected price movements for stock symbols over various periods.',
            icon: 'fa-solid fa-chart-line',
            primary: true,
            shortcuts: []
          },
          {
            url: '/placeOrders',
            label: 'Place Orders',
            description: 'Place daily extended hours orders that will resubmit every day (7am ET) until filled or cancelled.',
            icon: 'fa-solid fa-calendar-plus',
            primary: false,
            shortcuts: []
          }
        ]
      }
    ]
  };
}
