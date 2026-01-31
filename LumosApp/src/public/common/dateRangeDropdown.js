/**
 * Reusable date range dropdown component with milestone support
 * Used by History page and Trade Explorer page
 */

(function() {
  'use strict';

  const STANDARD_RANGES = [
    { value: 'TODAY', label: 'Today', group: 'Ranges' },
    { value: 'THIS_WEEK', label: 'This Week', group: 'Ranges' },
    { value: 'THIS_MONTH', label: 'This Month', group: 'Ranges' },
    { value: 'PRIOR_MONTH', label: 'Prior Month', group: 'Ranges' },
    { value: 'LAST_15_DAYS', label: 'Last 15 Days', group: 'Ranges' },
    { value: 'LAST_30_DAYS', label: 'Last 30 Days', group: 'Ranges' },
    { value: 'LAST_60_DAYS', label: 'Last 60 Days', group: 'Ranges' },
    { value: 'LAST_90_DAYS', label: 'Last 90 Days', group: 'Ranges' },
    { value: 'LAST_6_MONTHS', label: 'Last 6 Months', group: 'Ranges' },
    { value: 'LAST_365_DAYS', label: 'Last 365 Days', group: 'Ranges' },
    { value: 'YTD', label: 'Year to Date', group: 'Ranges' },
    { value: 'LAST_YEAR', label: 'Prior Year', group: 'Ranges' },
    { value: 'ALL', label: 'All Time', group: 'Ranges' }
  ];

  class DateRangeDropdown {
    constructor(config) {
      this.containerId = config.containerId;
      this.searchInputId = config.searchInputId;
      this.listContainerId = config.listContainerId;
      this.labelElementId = config.labelElementId;
      this.milestones = config.milestones || [];
      this.currentValue = config.defaultValue || 'YTD';
      this.currentAccountId = config.accountId || null;
      this.onChange = config.onChange || (() => {});
      
      this.dropdownItems = [];
      this.updateDropdownItems();
      this.initEventHandlers();
    }

    updateDropdownItems() {
      const relevantMilestones = this.milestones.filter(m => {
        if (this.currentAccountId === null) {
          return m.AccountID === null;
        }
        return m.AccountID === null || m.AccountID === this.currentAccountId;
      });

      const milestoneItems = relevantMilestones.map(m => ({
        value: `MILESTONE:${m.ID}`,
        label: m.Name,
        group: 'Milestones'
      }));

      this.dropdownItems = [...STANDARD_RANGES, ...milestoneItems];
    }

    setAccountId(accountId) {
      this.currentAccountId = accountId;
      this.updateDropdownItems();
      this.renderList();
      this.updateLabel();
    }

    setValue(value) {
      this.currentValue = value;
      this.updateLabel();
    }

    getValue() {
      return this.currentValue;
    }

    initEventHandlers() {
      const searchInput = document.getElementById(this.searchInputId);
      if (searchInput) {
        searchInput.addEventListener('input', (e) => {
          const term = e.target.value.toLowerCase();
          this.renderList(term);
        });
        searchInput.addEventListener('click', (e) => e.stopPropagation());
      }

      this.renderList();
      this.updateLabel();
    }

    renderList(searchTerm = '') {
      const listContainer = document.getElementById(this.listContainerId);
      if (!listContainer) return;

      listContainer.innerHTML = '';

      const filteredItems = this.dropdownItems.filter(item => 
        item.label.toLowerCase().includes(searchTerm)
      );

      const hasMilestones = filteredItems.some(i => i.group === 'Milestones');
      const showGroups = hasMilestones;

      const groups = {};
      if (showGroups) {
        filteredItems.forEach(item => {
          if (!groups[item.group]) groups[item.group] = [];
          groups[item.group].push(item);
        });
      } else {
        groups['Ranges'] = filteredItems;
      }

      const groupOrder = ['Ranges', 'Milestones'];

      groupOrder.forEach(groupName => {
        const items = groups[groupName];
        if (!items || items.length === 0) return;

        if (showGroups) {
          const header = document.createElement('div');
          header.className = 'px-3 py-1 small fw-bold border-bottom border-top';
          header.style.color = '#8b95a3';
          header.style.backgroundColor = '#252525';
          header.textContent = groupName;
          listContainer.appendChild(header);
        }

        items.forEach(item => {
          const div = document.createElement('div');
          div.className = 'dropdown-item d-flex align-items-center justify-content-between px-3 py-1';
          div.style.cursor = 'pointer';
          if (item.value === this.currentValue) {
            div.classList.add('active');
          }
          
          div.textContent = item.label;
          div.onclick = () => {
            this.currentValue = item.value;
            this.updateLabel();
            this.onChange(item.value);
          };
          listContainer.appendChild(div);
        });
      });

      if (filteredItems.length === 0) {
        listContainer.innerHTML = '<div class="p-2 text-muted small text-center">No matches found</div>';
      }
    }

    updateLabel() {
      const labelEl = document.getElementById(this.labelElementId);
      if (!labelEl) return;

      let item = this.dropdownItems.find(i => i.value === this.currentValue);
      
      if (!item && this.currentValue.startsWith('MILESTONE:')) {
        const id = parseInt(this.currentValue.split(':')[1]);
        const m = this.milestones.find(m => m.ID === id);
        if (m) {
          item = { value: `MILESTONE:${m.ID}`, label: m.Name, group: 'Milestones' };
        }
      }

      if (item) {
        labelEl.textContent = item.label;
      } else {
        const std = STANDARD_RANGES.find(i => i.value === this.currentValue);
        labelEl.textContent = std ? std.label : this.currentValue;
      }
    }
  }

  window.DateRangeDropdown = DateRangeDropdown;
})();
