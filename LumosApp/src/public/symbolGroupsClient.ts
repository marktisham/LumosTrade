// Wrap in IIFE to avoid global scope conflicts with other client files
(function() {

type SymbolGroupRow = {
  ID: number | null;
  Name: string;
  Symbols: string;
  LastUpdated: string;
  RollupGroup: boolean;
};

type SortDirection = 'asc' | 'desc';
type ColumnKey = keyof SymbolGroupRow;

type SortState = {
  key: ColumnKey;
  direction: SortDirection;
};

const DEFAULT_SORT: SortState = { key: 'Name', direction: 'asc' };
const REQUEST_ENDPOINT = '/request/symbolGroups';
const isDemoMode = (window as any).LUMOS_DEMO_MODE === true;
const demoAllowEdits = (window as any).LUMOS_DEMO_ALLOW_EDITS === true;
const editsEnabled = !isDemoMode || demoAllowEdits;

// State
let currentSort: SortState = { ...DEFAULT_SORT };
let currentSearch: string = '';

// Helper to show errors in a Bootstrap modal instead of alert()
const showErrorModal = (message: string, onHidden?: () => void) => {
  const messageEl = document.getElementById('symbol-groups-error-message');
  if (messageEl) messageEl.textContent = message;
  const modalEl = document.getElementById('symbolGroupsErrorModal');
  if (modalEl && (window as any).bootstrap) {
    const modal = (window as any).bootstrap.Modal.getOrCreateInstance(modalEl);
    
    // Remove previous event listeners to avoid duplicates
    modalEl.removeEventListener('hidden.bs.modal', (modalEl as any)._onHiddenCallback);
    
    // Add new event listener for when modal is hidden
    if (onHidden) {
      const callback = () => {
        onHidden();
      };
      (modalEl as any)._onHiddenCallback = callback;
      modalEl.addEventListener('hidden.bs.modal', callback, { once: true });
    }
    
    modal.show();
  } else {
    // Fallback
    alert(message);
    if (onHidden) onHidden();
  }
};
let lastAddedGroupId: number | null = null;

const fetchSymbolGroups = async (): Promise<SymbolGroupRow[]> => {
  const params = new URLSearchParams();
  params.append('sort', currentSort.key);
  params.append('dir', currentSort.direction);
  if (currentSearch) {
    params.append('search', currentSearch);
  }

  const response = await fetch(`${REQUEST_ENDPOINT}?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch symbol groups: ${response.statusText}`);
  }
  return response.json();
};

const updateSymbolGroup = async (id: number, name: string, symbols: string, rollup: boolean): Promise<void> => {
  const response = await fetch(`${REQUEST_ENDPOINT}/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name, symbols, rollup }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to update symbol group');
  }
};

const addSymbolGroup = async (name: string, symbols: string, rollup: boolean): Promise<SymbolGroupRow> => {
  const response = await fetch(REQUEST_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name, symbols, rollup }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to add symbol group');
  }
  return response.json();
};

const deleteSymbolGroup = async (id: number): Promise<void> => {
  const response = await fetch(`${REQUEST_ENDPOINT}/${id}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to delete symbol group');
  }
};

const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleString();
};

const formatSymbols = (symbolsStr: string): string => {
  if (!symbolsStr) return '';
  
  // Split by comma or space, filter empty, trim, uppercase
  const symbols = symbolsStr
    .split(/[\s,]+/)
    .map(s => s.trim().toUpperCase())
    .filter(s => s.length > 0);
    
  // De-dupe using Set
  const uniqueSymbols = [...new Set(symbols)];
  
  // Sort alphabetically
  uniqueSymbols.sort();
  
  // Join with comma and space
  return uniqueSymbols.join(', ');
};

const attachHandlersToRow = (row: HTMLElement): void => {
  if (!editsEnabled) return;
  // Row click for edit
  row.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('input') || target.closest('.actions')) return;

    // If this is the just-added row, always allow edit
    const rowId = parseInt(row.getAttribute('data-group-id') || '0');
    if (lastAddedGroupId && rowId === lastAddedGroupId) {
      lastAddedGroupId = null;
      startEditGroup(row);
      return;
    }

    // Check if another row is currently being edited
    const currentlyEditingRow = document.querySelector('tr.editing');
    if (currentlyEditingRow) {
      // If clicking the same row, allow edit as normal
      if (currentlyEditingRow === row) {
        return;
      }
      // If another row is being edited, save it, but do NOT start a new edit
      const id = parseInt(currentlyEditingRow.getAttribute('data-group-id') || '0');
      await saveEditGroup(currentlyEditingRow as HTMLElement, id);
      return;
    }

    // Only start edit if not already editing
    startEditGroup(row);
  });

  // Delete button: show Bootstrap modal
  row.querySelector('.delete-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const id = parseInt(row.getAttribute('data-group-id') || '0');
    const name = (row.querySelector('.group-name')?.textContent || '').trim();
    // Set message
    const messageEl = document.getElementById('symbol-groups-delete-message');
    if (messageEl) {
      messageEl.textContent = name ? `Are you sure you want to delete "${name}"?` : 'Are you sure you want to delete this symbol group?';
    }
    // Store id for confirm
    (window as any)._pendingDeleteGroupId = id;
    // Attach confirm handler (remove previous first)
    const confirmBtn = document.getElementById('symbol-groups-confirm-delete');
    if (confirmBtn) {
      const newHandler = async () => {
        const id = (window as any)._pendingDeleteGroupId;
        if (!id) return;
        try {
          await deleteSymbolGroup(id);
        } catch (error) {
          showErrorModal('Failed to delete symbol group');
        } finally {
          (window as any)._pendingDeleteGroupId = null;
          // Always hide modal, even on error
          const modalEl = document.getElementById('symbolGroupsDeleteModal');
          if (modalEl && (window as any).bootstrap) {
            const modal = (window as any).bootstrap.Modal.getOrCreateInstance(modalEl);
            modal.hide();
          }
          loadData();
        }
      };
      // Remove any previous click handlers by cloning
      const newBtn = confirmBtn.cloneNode(true);
      confirmBtn.parentNode?.replaceChild(newBtn, confirmBtn);
      newBtn.addEventListener('click', newHandler);
    }
    // Show modal
    const modalEl = document.getElementById('symbolGroupsDeleteModal');
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

const renderTable = (groups: SymbolGroupRow[] | null): void => {
  const root = document.querySelector('[data-symbol-groups-table-root]');
  if (!root) return;

  if (groups === null) {
    root.innerHTML = `
      <div class="text-center py-5">
        <div class="spinner-border spinner-border-sm text-secondary me-2" role="status"></div>
        <span class="fs-5 text-muted align-middle">Loading Symbols...</span>
      </div>
    `;
    return;
  }

  const getSortIcon = (key: ColumnKey) => {
    if (currentSort.key !== key) return '';
    return currentSort.direction === 'asc' ? ' ▲' : ' ▼';
  };

  if (groups.length === 0) {
    // Render an empty table (so Add New can insert a row) plus a no-results message
    const tableHtml = `
      <table class="table table-striped table-hover">
        <thead>
          <tr>
              <th style="width: 25%; cursor: pointer;" data-sort="Name">Name${getSortIcon('Name')}</th>
              <th style="width: 50%; cursor: pointer;" data-sort="Symbols">Symbols${getSortIcon('Symbols')}</th>
              <th style="width: 10%;">Rollup</th>
              <th style="width: 20%; cursor: pointer;" data-sort="LastUpdated">Last Updated${getSortIcon('LastUpdated')}</th>
              <th style="width: 1%; white-space: nowrap;"></th>
            </tr>
        </thead>
        <tbody>
          <tr class="no-rows">
            <td colspan="5" class="text-center text-muted">No symbol groups found.</td>
          </tr>
        </tbody>
      </table>
    `;

    root.innerHTML = tableHtml;

    // Add sort listeners (same as main table)
    root.querySelectorAll('th[data-sort]').forEach(th => {
      th.addEventListener('click', () => {
        const key = th.getAttribute('data-sort') as ColumnKey;
        handleSort(key);
      });
    });

    // No data rows to attach handlers to, but return so rest of render is skipped
    return;
  }

  const tableHtml = `
    <table class="table table-striped table-hover">
      <thead>
        <tr>
          <th style="width: 25%; cursor: pointer;" data-sort="Name">Name${getSortIcon('Name')}</th>
          <th style="width: 50%; cursor: pointer;" data-sort="Symbols">Symbols${getSortIcon('Symbols')}</th>
          <th style="width: 10%;">Rollup</th>
          <th style="width: 20%; cursor: pointer;" data-sort="LastUpdated">Last Updated${getSortIcon('LastUpdated')}</th>
          <th style="width: 1%; white-space: nowrap;"></th>
        </tr>
      </thead>
      <tbody>
        ${groups.map(group => `
          <tr data-group-id="${group.ID}">
            <td class="group-name">${group.Name}</td>
            <td class="group-symbols">${group.Symbols}</td>
            <td class="group-rollup">${group.RollupGroup ? '<span class="badge bg-success">Yes</span>' : '<span class="badge bg-secondary">No</span>'}</td>
            <td class="group-last-updated">${formatDate(group.LastUpdated)}</td>
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

  root.innerHTML = tableHtml;

  // Add sort listeners
  root.querySelectorAll('th[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.getAttribute('data-sort') as ColumnKey;
      handleSort(key);
    });
  });

  // Add event listeners to rows
  root.querySelectorAll('tbody tr[data-group-id]').forEach(row => {
    attachHandlersToRow(row as HTMLElement);
  });
};

const startAddNewGroup = async (): Promise<void> => {
  if (!editsEnabled) return;
  const root = document.querySelector('[data-symbol-groups-table-root]');
  if (!root) return;

  // (Do not change sort on Add New click — sort will be changed after successful save)

  // Check for existing edit and save it
  const editingRow = document.querySelector('tr.editing') as HTMLElement;
  if (editingRow) {
    const id = parseInt(editingRow.getAttribute('data-group-id') || '0');
    await saveEditGroup(editingRow, id, false);
  }

  // Find the existing table
  const table = root.querySelector('table');
  if (!table) return;

  // Check if there's already an add row
  if (table.querySelector('.adding')) return;

  const tbody = table.querySelector('tbody');
  if (!tbody) return;

  // Add new row for adding
  const addRowHtml = `
    <tr class="adding">
      <td><input type="text" class="form-control form-control-sm" id="new-name" placeholder="Group Name" style="width: 100%;"></td>
      <td><input type="text" class="form-control form-control-sm" id="new-symbols" placeholder="AAPL,GOOGL,MSFT" style="width: 100%;"></td>
      <td><input type="checkbox" class="form-check-input" id="new-rollup" title="Include this group in rollup charts"></td>
      <td style="white-space: nowrap;">
        <button class="btn btn-success btn-sm save-btn" title="Save">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" class="bi bi-check-lg" viewBox="0 0 16 16"><path d="M12.736 3.97a.733.733 0 0 1 1.047 0c.286.289.29.756.01 1.05L7.88 12.01a.733.733 0 0 1-1.065.02L3.217 8.384a.757.757 0 0 1 0-1.06.733.733 0 0 1 1.047 0l3.052 3.093 5.4-6.425a.247.247 0 0 1 .02-.022Z"/></svg>
        </button>
        <button class="btn btn-secondary btn-sm cancel-btn ms-1" title="Cancel">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" class="bi bi-x-lg" viewBox="0 0 16 16"><path d="M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8 2.146 2.854Z"/></svg>
        </button>
      </td>
    </tr>
  `;

  tbody.insertAdjacentHTML('afterbegin', addRowHtml);

  const addRow = tbody.querySelector('.adding');
  if (addRow) {
    addRow.querySelector('.save-btn')?.addEventListener('click', () => saveNewGroup(true));
    addRow.querySelector('.cancel-btn')?.addEventListener('click', () => cancelAddGroup());

    // Add keyboard shortcuts
    addRow.querySelectorAll('input').forEach(input => {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          saveNewGroup(true);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          cancelAddGroup();
        }
      });
    });

    // Set focus and tab state to the Name input
    const nameInput = addRow.querySelector('#new-name') as HTMLInputElement | null;
    if (nameInput) {
      nameInput.focus();
      nameInput.select();
    }
  }
};

const cancelAddGroup = (): void => {
  const addRow = document.querySelector('.adding');
  if (addRow) {
    addRow.remove();
  }
};

const saveNewGroup = async (isExplicit: boolean = false): Promise<void> => {
  const addRow = document.querySelector('.adding') as HTMLElement;
  if (!addRow) return;

  if (addRow.hasAttribute('data-saving')) return;
  addRow.setAttribute('data-saving', 'true');

  const name = (document.getElementById('new-name') as HTMLInputElement)?.value.trim();
  let symbols = (document.getElementById('new-symbols') as HTMLInputElement)?.value.trim();
  const rollup = !!(document.getElementById('new-rollup') as HTMLInputElement)?.checked;
  

  let errorMsg = '';
  if (!name || !symbols) {
    errorMsg = 'Name and Symbols are required';
  } else if (isDuplicateName(name)) {
    errorMsg = 'A group with this name already exists';
  }

  if (errorMsg) {
    // Always show validation modal and keep the add inputs open so user can correct
    addRow.removeAttribute('data-saving');
    showErrorModal(errorMsg, () => {
      if (isExplicit) {
        const nameInput = document.getElementById('new-name') as HTMLInputElement | null;
        if (nameInput) {
          nameInput.focus();
          nameInput.select();
        }
      }
    });
    return;
  }

  // Format symbols before saving
  symbols = formatSymbols(symbols);

  try {
    const newGroup = await addSymbolGroup(name, symbols, rollup);
    
    // Replace the add row with the new data row
    if (addRow) {
      const parent = addRow.parentElement;
      const newRowHtml = `
        <tr data-group-id="${newGroup.ID}">
          <td class="group-name">${newGroup.Name}</td>
          <td class="group-symbols">${newGroup.Symbols}</td>
          <td class="group-last-updated">${formatDate(newGroup.LastUpdated)}</td>
          <td class="actions" style="white-space: nowrap;">
              <button class="btn btn-sm btn-danger delete-btn ms-1" title="${editsEnabled ? 'Delete' : 'Unavailable in demo mode'}" ${editsEnabled ? '' : 'disabled aria-disabled="true"'}>
                <i class="fa-solid fa-trash" aria-hidden="true"></i>
              </button>
          </td>
        </tr>
      `;
      addRow.outerHTML = newRowHtml;
      
      // Attach event listeners to the new row
      const newRow = parent?.querySelector(`[data-group-id="${newGroup.ID}"]`) as HTMLElement;
      if (newRow) {
        attachHandlersToRow(newRow);
        // After successful save of a new entry, switch sort to LastUpdated desc and reload
        currentSort = { key: 'LastUpdated', direction: 'desc' };
        lastAddedGroupId = null;
        loadData();
        return;
      }
    }
  } catch (error) {
    console.error('Error saving new group:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to save new group';
    addRow.removeAttribute('data-saving');
    if (isExplicit) {
      showErrorModal(errorMessage, () => {
        const nameInput = document.getElementById('new-name') as HTMLInputElement | null;
        if (nameInput) {
          nameInput.focus();
          nameInput.select();
        }
      });
    } else {
      cancelAddGroup();
    }
  }
};

const isDuplicateName = (name: string, excludeId?: number): boolean => {
  const rows = document.querySelectorAll('tbody tr[data-group-id]');
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] as HTMLElement;
    const id = parseInt(row.getAttribute('data-group-id') || '0');
    if (excludeId && id === excludeId) continue;

    // If the row is being edited, we can't trust its textContent for the name cell as it contains an input
    // But since we are checking *other* rows, and only one row is edited at a time (mostly), 
    // we can assume other rows are not in edit mode OR we need to handle it.
    // Actually, with auto-save, only one row is in edit mode at a time.
    // The current row being validated is passed as excludeId (if editing) or no excludeId (if adding).
    
    const nameCell = row.querySelector('.group-name');
    if (nameCell) {
      const rowName = nameCell.textContent?.trim() || '';
      if (rowName.toLowerCase() === name.toLowerCase()) {
        return true;
      }
    }
  }
  return false;
};

const startEditGroup = (row: HTMLElement): void => {
  if (row.classList.contains('editing')) return;
  const id = parseInt(row.getAttribute('data-group-id') || '0');
  const nameCell = row.querySelector('.group-name') as HTMLElement;
  const symbolsCell = row.querySelector('.group-symbols') as HTMLElement;
  const actionsCell = row.querySelector('.actions') as HTMLElement;
  const rollupCell = row.querySelector('.group-rollup') as HTMLElement;

  const currentName = nameCell.textContent || '';
  const currentSymbols = symbolsCell.textContent || '';
  const existingBadge = row.querySelector('.group-rollup .badge');
  const rollupChecked = existingBadge?.classList.contains('bg-success') || false;

  // Store original values
  row.dataset.originalName = currentName;
  row.dataset.originalSymbols = currentSymbols;
  row.dataset.originalRollup = (rollupChecked ? 'true' : 'false');

  nameCell.innerHTML = `<input type="text" class="form-control form-control-sm" value="${currentName}" style="width: 100%">`;
  symbolsCell.innerHTML = `<input type="text" class="form-control form-control-sm" value="${currentSymbols}" style="width: 100%">`;
  rollupCell.innerHTML = `<input type="checkbox" class="form-check-input" title="Include this group in rollup charts">`;
  (rollupCell.querySelector('input') as HTMLInputElement).checked = rollupChecked;

  actionsCell.innerHTML = `
    <button class="btn btn-success btn-sm save-btn" title="Save">
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" class="bi bi-check-lg" viewBox="0 0 16 16"><path d="M12.736 3.97a.733.733 0 0 1 1.047 0c.286.289.29.756.01 1.05L7.88 12.01a.733.733 0 0 1-1.065.02L3.217 8.384a.757.757 0 0 1 0-1.06.733.733 0 0 1 1.047 0l3.052 3.093 5.4-6.425a.247.247 0 0 1 .02-.022Z"/></svg>
    </button>
    <button class="btn btn-secondary btn-sm cancel-btn ms-1" title="Cancel">
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" class="bi bi-x-lg" viewBox="0 0 16 16"><path d="M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L7.293 8 2.146 2.854Z"/></svg>
    </button>
  `;

  row.classList.add('editing');

  actionsCell.querySelector('.save-btn')?.addEventListener('click', () => saveEditGroup(row, id, true));
  actionsCell.querySelector('.cancel-btn')?.addEventListener('click', () => cancelEditGroup(row));

  // Add keyboard shortcuts
  row.querySelectorAll('input').forEach(input => {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        saveEditGroup(row, id, true);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelEditGroup(row);
      }
    });
  });
};

const saveEditGroup = async (row: HTMLElement, id: number, isExplicit: boolean = false): Promise<void> => {
  if (row.hasAttribute('data-saving')) return;
  row.setAttribute('data-saving', 'true');

  const nameInput = row.querySelector('.group-name input') as HTMLInputElement;
  const symbolsInput = row.querySelector('.group-symbols input') as HTMLInputElement;
  const rollupInput = row.querySelector('.group-rollup input') as HTMLInputElement | null;

  const name = nameInput.value.trim();
  let symbols = symbolsInput.value.trim();

  let errorMsg = '';
  if (!name || !symbols) {
    errorMsg = 'Name and Symbols are required';
  } else if (isDuplicateName(name, id)) {
    errorMsg = 'A group with this name already exists';
  }

  if (errorMsg) {
    // Show validation modal and keep edit inputs open so user can correct
    row.removeAttribute('data-saving');
    showErrorModal(errorMsg, () => {
      if (isExplicit) {
        const nameInput = row.querySelector('.group-name input') as HTMLInputElement;
        if (nameInput) {
          nameInput.focus();
          nameInput.select();
        }
      }
    });
    return;
  }

  // Format symbols before saving
  symbols = formatSymbols(symbols);

  try {
    await updateSymbolGroup(id, name, symbols, !!rollupInput?.checked);
    // Update the row with new values
    const nameCell = row.querySelector('.group-name') as HTMLElement;
    const symbolsCell = row.querySelector('.group-symbols') as HTMLElement;
    const lastUpdatedCell = row.querySelector('.group-last-updated') as HTMLElement;
    const rollupCell = row.querySelector('.group-rollup') as HTMLElement;
    const actionsCell = row.querySelector('.actions') as HTMLElement;

    nameCell.textContent = name;
    symbolsCell.textContent = symbols;
    lastUpdatedCell.textContent = 'Just now';
    if (rollupCell) {
      const isRollup = !!rollupInput?.checked;
      rollupCell.innerHTML = isRollup ? '<span class="badge bg-success">Yes</span>' : '<span class="badge bg-secondary">No</span>';
    }
    actionsCell.innerHTML = `
      <button class="btn btn-sm btn-danger delete-btn ms-1" title="${editsEnabled ? 'Delete' : 'Unavailable in demo mode'}" ${editsEnabled ? '' : 'disabled aria-disabled="true"'}>
        <i class="fa-solid fa-trash" aria-hidden="true"></i>
      </button>
    `;

    row.classList.remove('editing');
    row.removeAttribute('data-saving');
    delete row.dataset.originalName;
    delete row.dataset.originalSymbols;

    // Re-attach event listeners
    attachHandlersToRow(row);

  } catch (error) {
    console.error('Error saving group:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to save changes';
    row.removeAttribute('data-saving');
    if (isExplicit) {
      showErrorModal(errorMessage, () => {
        const nameInput = row.querySelector('.group-name input') as HTMLInputElement;
        if (nameInput) {
          nameInput.focus();
          nameInput.select();
        }
      });
    } else {
      cancelEditGroup(row);
    }
  }
};

const cancelEditGroup = (row: HTMLElement, originalName?: string, originalSymbols?: string): void => {
  const nameCell = row.querySelector('.group-name') as HTMLElement;
  const symbolsCell = row.querySelector('.group-symbols') as HTMLElement;
  const actionsCell = row.querySelector('.actions') as HTMLElement;
  const rollupCell = row.querySelector('.group-rollup') as HTMLElement;

  // Use passed values or fallback to dataset
  const name = originalName ?? row.dataset.originalName ?? '';
  const symbols = originalSymbols ?? row.dataset.originalSymbols ?? '';
  const originalRollup = (row.dataset.originalRollup === 'true');

  nameCell.textContent = name;
  symbolsCell.textContent = symbols;
  rollupCell.innerHTML = originalRollup ? '<span class="badge bg-success">Yes</span>' : '<span class="badge bg-secondary">No</span>';
  actionsCell.innerHTML = `
    <button class="btn btn-sm btn-danger delete-btn ms-1" title="${editsEnabled ? 'Delete' : 'Unavailable in demo mode'}" ${editsEnabled ? '' : 'disabled aria-disabled="true"'}>
      <i class="fa-solid fa-trash" aria-hidden="true"></i>
    </button>
  `;

  row.classList.remove('editing');
  delete row.dataset.originalName;
  delete row.dataset.originalSymbols;
  delete row.dataset.originalRollup;

  // Re-attach event listeners
  attachHandlersToRow(row);
};

let loadingTimer: ReturnType<typeof setTimeout> | null = null;
const loadData = async (): Promise<void> => {
  const root = document.querySelector('[data-symbol-groups-table-root]');
  if (root) {
    if (loadingTimer) clearTimeout(loadingTimer);
    loadingTimer = setTimeout(() => {
      renderTable(null);
    }, 250);
  }
  try {
    const groups = await fetchSymbolGroups();
    if (loadingTimer) {
      clearTimeout(loadingTimer);
      loadingTimer = null;
    }
    renderTable(groups);
  } catch (error) {
    if (loadingTimer) {
      clearTimeout(loadingTimer);
      loadingTimer = null;
    }
    console.error('Error loading symbol groups:', error);
    if (root) {
      root.innerHTML = '<div class="alert alert-danger">Failed to load symbol groups</div>';
    }
  }
};

const initSearch = () => {
  const searchInput = document.getElementById('symbol-groups-search') as HTMLInputElement;
  const clearButton = document.getElementById('symbol-groups-clear-search');

  if (!searchInput || !clearButton) return;

  let debounceTimer: NodeJS.Timeout;

  searchInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      currentSearch = searchInput.value.trim();
      loadData();
    }, 300);
  });

  clearButton.addEventListener('click', () => {
    searchInput.value = '';
    currentSearch = '';
    loadData();
  });
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  loadData();
  initSearch();

  // Add New Group button
  if (editsEnabled) {
    document.getElementById('add-new-group')?.addEventListener('click', () => startAddNewGroup());
  }



  // Global click listener for auto-save
  document.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement;

    // If any Bootstrap modal is currently open, do not perform auto-save/auto-cancel
    // This prevents modal interactions (OK button) from causing the editing row to be auto-saved/cancelled.
    if (document.querySelector('.modal.show')) return;

    // Handle editing row
    const editingRow = document.querySelector('tr.editing') as HTMLElement;
    if (editingRow && !editingRow.contains(target)) {
      const id = parseInt(editingRow.getAttribute('data-group-id') || '0');
      await saveEditGroup(editingRow, id, false);
    }

    // Handle adding row
    const addingRow = document.querySelector('tr.adding') as HTMLElement;
    if (addingRow && !addingRow.contains(target) && !target.closest('#add-new-group')) {
      await saveNewGroup(false);
    }
  });
});

})();
