// Wrap in IIFE to avoid global scope conflicts
(function() {

type MilestoneRow = {
  ID: number | null;
  AccountID: number | null;
  DayStart: string;
  DayEnd: string | null;
  Name: string;
};

type Account = {
  AccountID: number;
  Name: string;
};

type SortDirection = 'asc' | 'desc';
type ColumnKey = 'DayStart' | 'DayEnd' | 'Name' | 'AccountName';

type SortState = {
  key: ColumnKey;
  direction: SortDirection;
};

const DEFAULT_SORT: SortState = { key: 'DayStart', direction: 'desc' };
const REQUEST_ENDPOINT = '/request/milestones';
const isDemoMode = (window as any).LUMOS_DEMO_MODE === true;
const demoAllowEdits = (window as any).LUMOS_DEMO_ALLOW_EDITS === true;
const editsEnabled = !isDemoMode || demoAllowEdits;

let currentSort: SortState = { ...DEFAULT_SORT };
let lastAddedMilestoneId: number | null = null;

const showErrorModal = (message: string) => {
  const modalEl = document.getElementById('milestonesErrorModal');
  const messageEl = document.getElementById('milestones-error-message');
  if (modalEl && messageEl && (window as any).bootstrap) {
    messageEl.textContent = message;
    const modal = (window as any).bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();
  } else {
    alert(message);
  }
};

const fetchMilestones = async (): Promise<MilestoneRow[]> => {
  const params = new URLSearchParams({
    sort: currentSort.key,
    dir: currentSort.direction,
  });

  const response = await fetch(`${REQUEST_ENDPOINT}?${params.toString()}`);
  if (!response.ok) {
    throw new Error('Failed to fetch milestones');
  }
  return response.json();
};

const saveEditMilestone = async (row: HTMLElement, id: number, isExplicit: boolean = true): Promise<void> => {
  if (row.hasAttribute('data-saving')) return;
  row.setAttribute('data-saving', 'true');

  const nameInput = row.querySelector('.edit-name') as HTMLInputElement;
  const dayStartInput = row.querySelector('.edit-day-start') as HTMLInputElement;
  const dayEndInput = row.querySelector('.edit-day-end') as HTMLInputElement;
  const accountSelect = row.querySelector('.edit-account') as HTMLSelectElement;

  const name = nameInput.value.trim();
  const dayStart = dayStartInput.value;
  const dayEnd = dayEndInput.value || null;
  const accountId = accountSelect.value || null;

  if (!name) {
    if (isExplicit) showErrorModal('Name is required');
    row.removeAttribute('data-saving');
    return;
  }
  if (!dayStart) {
    if (isExplicit) showErrorModal('Day Start is required');
    row.removeAttribute('data-saving');
    return;
  }

  try {
    const response = await fetch(`${REQUEST_ENDPOINT}/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name, dayStart, dayEnd, accountId }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to update milestone');
    }

    // Update UI
    const nameCell = row.querySelector('.milestone-name') as HTMLElement;
    const dayStartCell = row.querySelector('.milestone-day-start') as HTMLElement;
    const dayEndCell = row.querySelector('.milestone-day-end') as HTMLElement;
    const accountCell = row.querySelector('.milestone-account') as HTMLElement;
    const actionsCell = row.querySelector('.actions') as HTMLElement;

    nameCell.textContent = name;
    dayStartCell.textContent = dayStart;
    dayEndCell.textContent = dayEnd || '';
    
    const accounts = (window as any).lumos?.accounts || [];
    const account = accounts.find((a: Account) => a.AccountID === Number(accountId));
    accountCell.textContent = account ? account.Name : 'All Accounts';
    accountCell.dataset.accountId = accountId || '';

    actionsCell.innerHTML = `
      <button class="btn btn-sm btn-danger delete-btn ms-1" title="${editsEnabled ? 'Delete' : 'Unavailable in demo mode'}" ${editsEnabled ? '' : 'disabled aria-disabled="true"'}>
        <i class="fa-solid fa-trash" aria-hidden="true"></i>
      </button>
    `;

    row.classList.remove('editing');
    row.removeAttribute('data-saving');
    delete row.dataset.originalName;
    delete row.dataset.originalDayStart;
    delete row.dataset.originalDayEnd;
    delete row.dataset.originalAccountId;

    attachHandlersToRow(row);

  } catch (error) {
    console.error('Error saving milestone:', error);
    if (isExplicit) {
      showErrorModal('Failed to save changes');
      row.removeAttribute('data-saving');
    } else {
      cancelEditMilestone(row);
    }
  }
};

const saveNewMilestone = async (isExplicit: boolean = true): Promise<void> => {
  const root = document.querySelector('[data-milestones-table-root]');
  const addingRow = root?.querySelector('.adding') as HTMLElement;
  if (!addingRow) return;

  if (addingRow.hasAttribute('data-saving')) return;
  addingRow.setAttribute('data-saving', 'true');

  const nameInput = addingRow.querySelector('#new-name') as HTMLInputElement;
  const dayStartInput = addingRow.querySelector('#new-day-start') as HTMLInputElement;
  const dayEndInput = addingRow.querySelector('#new-day-end') as HTMLInputElement;
  const accountSelect = addingRow.querySelector('#new-account') as HTMLSelectElement;

  const name = nameInput.value.trim();
  const dayStart = dayStartInput.value;
  const dayEnd = dayEndInput.value || null;
  const accountId = accountSelect.value || null;

  if (!name) {
    if (isExplicit) showErrorModal('Name is required');
    addingRow.removeAttribute('data-saving');
    return;
  }
  if (!dayStart) {
    if (isExplicit) showErrorModal('Day Start is required');
    addingRow.removeAttribute('data-saving');
    return;
  }

  try {
    const response = await fetch(REQUEST_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name, dayStart, dayEnd, accountId }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to add milestone');
    }

    const newMilestone: MilestoneRow = await response.json();
    lastAddedMilestoneId = newMilestone.ID;

    // Force sort to DayStart desc to show new item at top if that's the sort
    currentSort = { key: 'DayStart', direction: 'desc' };
    
    loadData();

  } catch (error) {
    console.error('Error adding milestone:', error);
    if (isExplicit) {
      showErrorModal('Failed to add milestone');
      addingRow.removeAttribute('data-saving');
    } else {
      cancelAddMilestone();
    }
  }
};

const deleteMilestone = async (id: number): Promise<void> => {
  const response = await fetch(`${REQUEST_ENDPOINT}/${id}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to delete milestone');
  }
};

const startEditMilestone = (row: HTMLElement) => {
  if (row.classList.contains('editing')) return;
  row.classList.add('editing');

  const nameCell = row.querySelector('.milestone-name') as HTMLElement;
  const dayStartCell = row.querySelector('.milestone-day-start') as HTMLElement;
  const dayEndCell = row.querySelector('.milestone-day-end') as HTMLElement;
  const accountCell = row.querySelector('.milestone-account') as HTMLElement;
  const actionsCell = row.querySelector('.actions') as HTMLElement;

  const currentName = nameCell.textContent || '';
  const currentDayStart = dayStartCell.textContent || '';
  const currentDayEnd = dayEndCell.textContent || '';
  const currentAccountId = accountCell.dataset.accountId || '';

  // Store original values
  row.dataset.originalName = currentName;
  row.dataset.originalDayStart = currentDayStart;
  row.dataset.originalDayEnd = currentDayEnd;
  row.dataset.originalAccountId = currentAccountId;

  const accounts = (window as any).lumos?.accounts || [];
  const accountOptions = accounts.map((a: Account) => 
    `<option value="${a.AccountID}" ${String(a.AccountID) === currentAccountId ? 'selected' : ''}>${a.Name}</option>`
  ).join('');

  nameCell.innerHTML = `<input type="text" class="form-control form-control-sm edit-name" value="${currentName}" style="width: 100%;">`;
  dayStartCell.innerHTML = `<input type="date" class="form-control form-control-sm edit-day-start" value="${currentDayStart}" style="width: 100%;">`;
  dayEndCell.innerHTML = `<input type="date" class="form-control form-control-sm edit-day-end" value="${currentDayEnd}" style="width: 100%;">`;
  accountCell.innerHTML = `
    <select class="form-select form-select-sm edit-account" style="width: 100%;">
      <option value="" ${currentAccountId === '' ? 'selected' : ''}>All Accounts</option>
      ${accountOptions}
    </select>
  `;

  actionsCell.innerHTML = `
    <button class="btn btn-success btn-sm save-btn" title="Save">
      <i class="fa-solid fa-check"></i>
    </button>
    <button class="btn btn-secondary btn-sm cancel-btn ms-1" title="Cancel">
      <i class="fa-solid fa-xmark"></i>
    </button>
  `;

  const saveBtn = actionsCell.querySelector('.save-btn');
  const cancelBtn = actionsCell.querySelector('.cancel-btn');
  const id = parseInt(row.getAttribute('data-milestone-id') || '0');

  saveBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    saveEditMilestone(row, id, true);
  });

  cancelBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    cancelEditMilestone(row);
  });

  // Add keyboard shortcuts
  row.querySelectorAll('input, select').forEach(input => {
    input.addEventListener('keydown', (e) => {
      const keyEvent = e as KeyboardEvent;
      if (keyEvent.key === 'Enter') {
        e.preventDefault();
        saveEditMilestone(row, id, true);
      } else if (keyEvent.key === 'Escape') {
        e.preventDefault();
        cancelEditMilestone(row);
      }
    });
    input.addEventListener('click', (e) => e.stopPropagation());
  });
};

const cancelEditMilestone = (row: HTMLElement) => {
  const nameCell = row.querySelector('.milestone-name') as HTMLElement;
  const dayStartCell = row.querySelector('.milestone-day-start') as HTMLElement;
  const dayEndCell = row.querySelector('.milestone-day-end') as HTMLElement;
  const accountCell = row.querySelector('.milestone-account') as HTMLElement;
  const actionsCell = row.querySelector('.actions') as HTMLElement;

  const name = row.dataset.originalName || '';
  const dayStart = row.dataset.originalDayStart || '';
  const dayEnd = row.dataset.originalDayEnd || '';
  const accountId = row.dataset.originalAccountId || '';

  nameCell.textContent = name;
  dayStartCell.textContent = dayStart;
  dayEndCell.textContent = dayEnd;
  
  const accounts = (window as any).lumos?.accounts || [];
  const account = accounts.find((a: Account) => String(a.AccountID) === accountId);
  accountCell.textContent = account ? account.Name : 'All Accounts';
  accountCell.dataset.accountId = accountId;

  actionsCell.innerHTML = `
    <button class="btn btn-sm btn-danger delete-btn ms-1" title="${editsEnabled ? 'Delete' : 'Unavailable in demo mode'}" ${editsEnabled ? '' : 'disabled aria-disabled="true"'}>
      <i class="fa-solid fa-trash" aria-hidden="true"></i>
    </button>
  `;

  row.classList.remove('editing');
  delete row.dataset.originalName;
  delete row.dataset.originalDayStart;
  delete row.dataset.originalDayEnd;
  delete row.dataset.originalAccountId;

  attachHandlersToRow(row);
};

const cancelAddMilestone = () => {
  const root = document.querySelector('[data-milestones-table-root]');
  const addingRow = root?.querySelector('.adding');
  if (addingRow) {
    addingRow.remove();
  }
};

const attachHandlersToRow = (row: HTMLElement): void => {
  if (!editsEnabled) return;
  row.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('input') || target.closest('select') || target.closest('.actions')) return;

    const rowId = parseInt(row.getAttribute('data-milestone-id') || '0');
    if (lastAddedMilestoneId && rowId === lastAddedMilestoneId) {
      lastAddedMilestoneId = null;
      startEditMilestone(row);
      return;
    }

    const currentlyEditingRow = document.querySelector('tr.editing');
    if (currentlyEditingRow) {
      if (currentlyEditingRow === row) return;
      const id = parseInt(currentlyEditingRow.getAttribute('data-milestone-id') || '0');
      await saveEditMilestone(currentlyEditingRow as HTMLElement, id);
      return;
    }

    startEditMilestone(row);
  });

  row.querySelector('.delete-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const id = parseInt(row.getAttribute('data-milestone-id') || '0');
    const name = (row.querySelector('.milestone-name')?.textContent || '').trim();
    
    const messageEl = document.querySelector('#milestonesDeleteModal .modal-body');
    if (messageEl) {
      messageEl.textContent = name ? `Are you sure you want to delete "${name}"?` : 'Are you sure you want to delete this milestone?';
    }

    (window as any)._pendingDeleteMilestoneId = id;

    const confirmBtn = document.getElementById('confirm-delete-milestone');
    if (confirmBtn) {
      const newHandler = async () => {
        const id = (window as any)._pendingDeleteMilestoneId;
        if (!id) return;
        try {
          await deleteMilestone(id);
        } catch (error) {
          showErrorModal('Failed to delete milestone');
        } finally {
          (window as any)._pendingDeleteMilestoneId = null;
          const modalEl = document.getElementById('milestonesDeleteModal');
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

    const modalEl = document.getElementById('milestonesDeleteModal');
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

const renderTable = (milestones: MilestoneRow[] | null): void => {
  const root = document.querySelector('[data-milestones-table-root]');
  if (!root) return;

  if (milestones === null) {
    root.innerHTML = `
      <div class="text-center py-5">
        <div class="spinner-border spinner-border-sm text-secondary me-2" role="status"></div>
        <span class="fs-5 text-muted align-middle">Loading Milestones...</span>
      </div>
    `;
    return;
  }

  const getSortIcon = (key: ColumnKey) => {
    if (currentSort.key !== key) return '';
    return currentSort.direction === 'asc' ? ' ▲' : ' ▼';
  };

  const accounts = (window as any).lumos?.accounts || [];
  const getAccountName = (id: number | null) => {
    if (!id) return 'All Accounts';
    const acc = accounts.find((a: Account) => a.AccountID === id);
    return acc ? acc.Name : 'Unknown Account';
  };

  const tableHeader = `
    <thead>
      <tr>
        <th style="width: 40%; cursor: pointer;" data-sort="Name">Name${getSortIcon('Name')}</th>
        <th style="width: 20%; cursor: pointer;" data-sort="AccountName">Account${getSortIcon('AccountName')}</th>
        <th style="width: 15%; cursor: pointer;" data-sort="DayStart">Day Start${getSortIcon('DayStart')}</th>
        <th style="width: 15%; cursor: pointer;" data-sort="DayEnd">Day End${getSortIcon('DayEnd')}</th>
        <th style="width: 10%; white-space: nowrap;"></th>
      </tr>
    </thead>
  `;

  if (milestones.length === 0) {
    root.innerHTML = `
      <table class="table table-striped table-hover">
        ${tableHeader}
        <tbody>
          <tr class="no-rows">
            <td colspan="5" class="text-center text-muted">No milestones found.</td>
          </tr>
        </tbody>
      </table>
    `;
  } else {
    root.innerHTML = `
      <table class="table table-striped table-hover">
        ${tableHeader}
        <tbody>
          ${milestones.map(m => `
            <tr data-milestone-id="${m.ID}">
              <td class="milestone-name">${m.Name}</td>
              <td class="milestone-account" data-account-id="${m.AccountID || ''}">${getAccountName(m.AccountID)}</td>
              <td class="milestone-day-start">${m.DayStart}</td>
              <td class="milestone-day-end">${m.DayEnd || ''}</td>
              <td class="actions" style="white-space: nowrap;">
                <button class="btn btn-sm btn-danger delete-btn ms-1" title="${editsEnabled ? 'Delete' : 'Unavailable in demo mode'}" ${editsEnabled ? '' : 'disabled aria-disabled="true"'}>
                  <i class="fa-solid fa-trash" aria-hidden="true"></i>
                </button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  root.querySelectorAll('th[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.getAttribute('data-sort') as ColumnKey;
      handleSort(key);
    });
  });

  root.querySelectorAll('tbody tr[data-milestone-id]').forEach(row => {
    attachHandlersToRow(row as HTMLElement);
  });
};

const startAddNewMilestone = async (): Promise<void> => {
  if (!editsEnabled) return;
  const root = document.querySelector('[data-milestones-table-root]');
  if (!root) return;

  const editingRow = document.querySelector('tr.editing') as HTMLElement;
  if (editingRow) {
    const id = parseInt(editingRow.getAttribute('data-milestone-id') || '0');
    await saveEditMilestone(editingRow, id, false);
  }

  const table = root.querySelector('table');
  if (!table) return;

  if (table.querySelector('.adding')) return;

  const tbody = table.querySelector('tbody');
  if (!tbody) return;

  const accounts = (window as any).lumos?.accounts || [];
  const accountOptions = accounts.map((a: Account) => `<option value="${a.AccountID}">${a.Name}</option>`).join('');

  const addRowHtml = `
    <tr class="adding">
      <td><input type="text" class="form-control form-control-sm" id="new-name" placeholder="Milestone Name" style="width: 100%;"></td>
      <td>
        <select class="form-select form-select-sm" id="new-account" style="width: 100%;">
          <option value="">All Accounts</option>
          ${accountOptions}
        </select>
      </td>
      <td><input type="date" class="form-control form-control-sm" id="new-day-start" style="width: 100%;"></td>
      <td><input type="date" class="form-control form-control-sm" id="new-day-end" style="width: 100%;"></td>
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
    addRow.querySelector('.save-btn')?.addEventListener('click', () => saveNewMilestone(true));
    addRow.querySelector('.cancel-btn')?.addEventListener('click', () => cancelAddMilestone());

    addRow.querySelectorAll('input, select').forEach(input => {
      input.addEventListener('keydown', (e) => {
        const keyEvent = e as KeyboardEvent;
        if (keyEvent.key === 'Enter') {
          e.preventDefault();
          saveNewMilestone(true);
        } else if (keyEvent.key === 'Escape') {
          e.preventDefault();
          cancelAddMilestone();
        }
      });
    });
  }
};

let loadingTimer: ReturnType<typeof setTimeout> | null = null;
const loadData = async (): Promise<void> => {
  const root = document.querySelector('[data-milestones-table-root]');
  if (root) {
    if (loadingTimer) clearTimeout(loadingTimer);
    loadingTimer = setTimeout(() => {
      renderTable(null);
    }, 250);
  }
  try {
    const milestones = await fetchMilestones();
    if (loadingTimer) {
      clearTimeout(loadingTimer);
      loadingTimer = null;
    }
    renderTable(milestones);
  } catch (error) {
    if (loadingTimer) {
      clearTimeout(loadingTimer);
      loadingTimer = null;
    }
    console.error('Error loading milestones:', error);
    if (root) {
      root.innerHTML = '<div class="alert alert-danger">Failed to load milestones</div>';
    }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  loadData();

  if (editsEnabled) {
    document.getElementById('add-new-milestone')?.addEventListener('click', () => startAddNewMilestone());
  }

  document.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement;
    if (document.querySelector('.modal.show')) return;

    const editingRow = document.querySelector('tr.editing') as HTMLElement;
    if (editingRow && !editingRow.contains(target)) {
      const id = parseInt(editingRow.getAttribute('data-milestone-id') || '0');
      await saveEditMilestone(editingRow, id, false);
    }

    const addingRow = document.querySelector('tr.adding') as HTMLElement;
    if (addingRow && !addingRow.contains(target) && !target.closest('#add-new-milestone')) {
      await saveNewMilestone(false);
    }
  });
});

})();
