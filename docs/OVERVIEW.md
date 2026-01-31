# Lumos Trade — Video Explainer Summary

**[Watch the full video on YouTube](https://www.youtube.com/watch?v=iRp06ikKhVo&list=PLFIgJytZ9IRceh-fO-vsr0ZJqcekVVryz&index=1)**

---

## Why I Created Lumos Trade

Lumos Trade was born out of a personal need for better visibility and control over trading activities across multiple brokerage accounts. Traditional broker platforms offer limited analytics and reporting capabilities, making it difficult to:

- **Track performance holistically**: When trading across multiple brokers (like E\*TRADE and Charles Schwab), there's no centralized view of overall performance. Each platform operates in a silo.
  
- **Analyze complex strategies**: Multi-leg options trades, scale-in/scale-out positions, and rolled positions require sophisticated tracking that most broker platforms don't provide out of the box.
  
- **Understand real profitability**: Broker P&L calculations often don't account for the full context—deposits, withdrawals, transfers between accounts, and capital at risk over time. Without this context, it's hard to measure true performance.
  
- **Make data-driven decisions**: Access to historical trade data is often limited, poorly organized, or requires manual export and manipulation in spreadsheets. This makes it difficult to spot patterns, learn from mistakes, or optimize strategies.

- **Maintain privacy and control**: Cloud-based third-party analytics platforms require sharing sensitive financial data, raising security and privacy concerns. Additionally, these platforms often come with subscription fees and limited customization.

Lumos Trade was created to solve these problems by providing a **self-hosted, privacy-first platform** that puts you in complete control of your trading data while offering sophisticated analytics and AI-assisted insights.

---

## Goals of Lumos Trade

The primary goals of Lumos Trade are to empower traders with:

### 1. **Unified Multi-Broker Analytics**
   - Consolidate data from multiple brokerage accounts (currently E\*TRADE and Charles Schwab, with extensibility for others).
   - Provide a single pane of glass for viewing trades, positions, and account balances across all brokers.
   - Normalize data from different broker APIs into a consistent, queryable format.

### 2. **Deep Trade Insights**
   - Track complex trading scenarios: multi-leg options, rolled positions, partial fills, scale-in/scale-out strategies.
   - Calculate key metrics: break-even prices, average costs, reward/risk ratios, win rates, and profitability by strategy.
   - Roll up performance by day, week, month, or custom periods to identify trends and patterns.

### 3. **Portfolio Context and Capital Tracking**
   - Measure gains and losses relative to **actual capital at risk** by accounting for deposits, withdrawals, and transfers.
   - Categorize holdings (e.g., Tech, Metals, Defensives) to compare strategy performance across sectors.
   - Track account balance history over time to understand cash flow and capital efficiency.

### 4. **Decision Support Tools**
   - Calculate **expected moves** for daily, weekly, and monthly horizons based on current market conditions.
   - Automate recurring trades during extended hours (7am–8pm) for systematic entry/exit strategies.
   - Provide actionable insights to refine trading strategies.

### 5. **AI-Assisted Workflows**
   - **LumosChat**: Ask natural language questions about your trades, accounts, and performance. Get instant answers backed by your actual trading data.
   - **LumosConjure**: Generate custom charts, tables, and reports on demand to explore specific hypotheses or visualize trends.
   - Leverage Google's Gemini AI models (via Vertex AI) for powerful, context-aware assistance.

### 6. **Privacy, Security, and Control**
   - **Self-hosted**: Run Lumos Trade in your own Google Cloud environment. Your data never leaves your control.
   - **Single-tenant architecture**: No shared infrastructure, no third-party data access.
   - **Open source**: Full transparency into how your data is processed and stored. Customize and extend as needed.

### 7. **Modern, Extensible Architecture**
   - Built with a **TypeScript monorepo** structure (`LumosTrade`, `LumosApp`, `LumosCLI`) for maintainability and modularity.
   - **Python-based AI workspace** (`LumosAI`) using Google's Agent Development Kit (ADK) for agent orchestration.
   - Designed for extensibility: add new brokers, create custom reports, integrate additional tools.

---

## Overview of the Features

Lumos Trade is packed with features designed to give traders comprehensive insights and control:

### **Core Features**

#### 1. **Multi-Broker Account Management**
   - Connect and sync data from E\*TRADE and Charles Schwab (with API extensibility for additional brokers).
   - View consolidated account balances, positions, and transaction history.
   - Automatically import orders and trades from broker APIs.

#### 2. **Trade Tracking and Reconstruction**
   - Automatically reconstruct trades from raw order data, even for complex scenarios:
     - Multi-leg options strategies (spreads, iron condors, straddles, etc.).
     - Rolled positions (closing one contract and opening another).
     - Partial fills and scale-in/scale-out executions.
   - Track open vs. closed trades with detailed P&L and performance metrics.

#### 3. **Advanced Analytics**
   - **Performance Metrics**: Calculate win rate, average win/loss, total P&L, and return on capital.
   - **Break-Even and Average Cost**: Track average entry prices and break-even levels for scale-in positions.
   - **Reward/Risk Ratios**: Analyze the risk/reward profile of each trade.
   - **Rollup Reports**: View performance by day, week, month, or custom periods. Identify trends and seasonality.

#### 4. **Portfolio Context**
   - **Capital Tracking**: Automatically adjust performance metrics for deposits, withdrawals, and transfers between accounts.
   - **Category-Based Reporting**: Group holdings by sector, strategy, or custom categories to compare performance.
   - **Account Balance History**: Visualize cash balance changes over time to understand capital flow.

#### 5. **Expected Move Calculator**
   - Calculate expected price movements for stocks and ETFs based on current implied volatility.
   - Generate daily, weekly, and monthly expected move ranges to inform entry/exit decisions.
   - Useful for setting profit targets and stop-loss levels.

#### 6. **Automated Recurring Trades**
   - Schedule recurring trades during extended hours (7am–8pm).
   - Useful for systematic strategies like DCA (dollar-cost averaging) or scheduled exits.

#### 7. **AI-Assisted Analysis**
   - **LumosChat**: A conversational AI agent that answers questions about your trading data:
     - "What was my best trade last month?"
     - "Show me all losing trades in my Tech category."
     - "How did I perform on Fridays vs. Mondays?"
   - **LumosConjure**: Generate custom visualizations and reports on demand:
     - "Create a bar chart of monthly P&L for 2025."
     - "Generate a table of my top 10 winning trades."
   - Powered by Google Gemini AI models running in your own Vertex AI project.

#### 8. **Filters and Search**
   - Filter trades by date range, broker, account, symbol, strategy, category, and outcome (win/loss).
   - Drill down into specific time periods (Today, Last 7 Days, Last 3 Months, etc.) with Eastern Time (ET) precision.
   - Search for specific symbols or trade IDs.

#### 9. **Data Import and Management**
   - Import historical trades manually via CSV or automatically via broker API integration.
   - Mark orders as incomplete or exclude them from calculations if needed.
   - Bulk edit trade categories and metadata.

### **Technical Features**

#### 10. **Self-Hosted on Google Cloud**
   - Deploy Lumos Trade to **Google Cloud Run** for a fully managed, serverless experience.
   - Use **Cloud SQL (MySQL 8.4)** for structured data storage.
   - Store OAuth tokens securely in **Google Cloud Datastore**.
   - Leverage **Vertex AI** for AI-powered features.

#### 11. **Environment Management**
   - Use the `./lumos` launcher script for environment-aware operations (development, production, demo).
   - Each environment has its own isolated configuration and infrastructure.
   - Seamless switching between environments for testing and deployment.

#### 12. **Extensible Architecture**
   - **LumosTrade**: Core domain library for trade/order processing, broker integration, and data access.
   - **LumosApp**: Express-based web UI for visualizing and interacting with data.
   - **LumosCLI**: Command-line interface for testing and automation.
   - **LumosAI**: Python-based AI workspace with agents (`LumosChat`, `LumosConjure`) and tools (`LumosDB`, `LumosTradeTool`).

#### 13. **Open Source and Customizable**
   - Full source code available for inspection, modification, and extension.
   - Add new broker integrations by extending the `BrokerClient` interface.
   - Create custom AI agents and tools using Google's Agent Development Kit (ADK).

### **User Experience Features**

#### 14. **Responsive Web Interface**
   - Modern, clean UI built with Bootstrap and server-side rendering (EJS templates).
   - Mobile-friendly design for on-the-go access.
   - Fast page loads and smooth navigation.

#### 15. **Live Demo Mode**
   - Try Lumos Trade with simulated data before deploying your own instance.
   - See the [main README](../README.md#live-demo) for the live demo link and credentials.

#### 16. **Date/Time Handling**
   - All dates and times displayed in **US Eastern Time (ET)** for consistency with US stock market hours.
   - Database stores UTC timestamps for precision and portability.
   - Filters and rollups respect ET boundaries (e.g., "Today" means today in ET, not UTC).

---

## Getting Started

Ready to try Lumos Trade? Here are your next steps:

1. **Try the Demo**: Visit the [live demo in the main README](../README.md#live-demo) to explore features with simulated data.
2. **Read the Docs**: Check out [INSTALLATION.md](INSTALLATION.md), [ARCHITECTURE.md](ARCHITECTURE.md), and [OPERATIONS.md](OPERATIONS.md) for deployment guidance.
3. **Deploy Your Own Instance**: Follow the installation guide to set up Lumos Trade in your Google Cloud environment.
4. **Connect Your Brokers**: Integrate your E\*TRADE and/or Charles Schwab accounts to start importing real data.
5. **Explore and Analyze**: Start exploring your trading data, asking questions with LumosChat, and generating reports with LumosConjure.

---

## Questions or Feedback?

Lumos Trade is an open-source project, and contributions are welcome! If you have questions, suggestions, or run into issues:

- **GitHub Issues**: Report bugs or request features on the [GitHub repository](https://github.com/marktisham/LumosTrade).
- **Documentation**: Refer to the `/docs` folder for detailed guides.
- **Community**: Share your experience and learn from other users.

Happy trading! 📈
