
type Bookmark = {
  name: string;
  state: any;
};

class BookmarkBar {
  private bookmarks: Bookmark[] = [];
  private onApplyState: (state: any) => void;
  private onGetState: () => any;
  private onResetFilters?: () => void;
  private currentContainer: HTMLElement | null = null;
  private pageName: string;
  private activeBookmark: string | null = null;
  private isDemoMode: boolean;

  constructor(
    pageName: string,
    onApplyState: (state: any) => void,
    onGetState: () => any,
    onResetFilters?: () => void,
    isDemoMode: boolean = false
  ) {
    this.pageName = pageName;
    this.onApplyState = onApplyState;
    this.onGetState = onGetState;
    this.onResetFilters = onResetFilters;
    this.isDemoMode = isDemoMode;
    this.loadBookmarks();
  }

  public clearSelection() {
    if (this.activeBookmark) {
      this.activeBookmark = null;
      this.updateUI();
    }
  }

  private async loadBookmarks() {
    try {
      if (this.isDemoMode) {
        this.loadFromLocalStorage();
      } else {
        const response = await fetch(`/request/userSettings?page=${this.pageName}`);
        if (response.ok) {
          const data = await response.json();
          if (data && Array.isArray(data.bookmarks)) {
            this.bookmarks = data.bookmarks;
            
            // Check for bookmark query param
            const urlParams = new URLSearchParams(window.location.search);
            const bookmarkName = urlParams.get('bookmark');
            if (bookmarkName) {
              const bookmark = this.bookmarks.find(b => b.name === bookmarkName);
              if (bookmark) {
                // Remove the query param from the URL without reloading
                const newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
                window.history.replaceState({path: newUrl}, '', newUrl);
                
                this.activeBookmark = bookmark.name;
                this.onApplyState(bookmark.state);
              }
            }
            
            this.updateUI();
          }
        }
      }
    } catch (error) {
      console.error('Failed to load bookmarks:', error);
    }
  }

  private loadFromLocalStorage() {
    try {
      const storageKey = `lumos-bookmarks-${this.pageName}`;
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const data = JSON.parse(stored);
        if (data && Array.isArray(data.bookmarks)) {
          this.bookmarks = data.bookmarks;
          
          // Check for bookmark query param
          const urlParams = new URLSearchParams(window.location.search);
          const bookmarkName = urlParams.get('bookmark');
          if (bookmarkName) {
            const bookmark = this.bookmarks.find(b => b.name === bookmarkName);
            if (bookmark) {
              // Remove the query param from the URL without reloading
              const newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
              window.history.replaceState({path: newUrl}, '', newUrl);
              
              this.activeBookmark = bookmark.name;
              this.onApplyState(bookmark.state);
            }
          }
          
          this.updateUI();
        }
      } else {
        this.updateUI();
      }
    } catch (error) {
      console.error('Failed to load bookmarks from localStorage:', error);
      this.updateUI();
    }
  }

  private async saveBookmarks() {
    try {
      if (this.isDemoMode) {
        this.saveToLocalStorage();
      } else {
        await fetch(`/request/userSettings?page=${this.pageName}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ bookmarks: this.bookmarks })
        });
      }
    } catch (error) {
      console.error('Failed to save bookmarks:', error);
    }
  }

  private saveToLocalStorage() {
    try {
      const storageKey = `lumos-bookmarks-${this.pageName}`;
      localStorage.setItem(storageKey, JSON.stringify({ bookmarks: this.bookmarks }));
    } catch (error) {
      console.error('Failed to save bookmarks to localStorage:', error);
    }
  }

  render(container: HTMLElement) {
    this.currentContainer = container;
    this.updateUI();
  }

  private updateUI() {
    if (!this.currentContainer) return;

    this.currentContainer.innerHTML = '';
    const toolbar = document.createElement('div');
    toolbar.className = 'btn-toolbar mb-3 flex-wrap flex-lg-nowrap gap-2 align-items-center bookmark-toolbar';
    
    // Render existing bookmarks
    if (this.bookmarks.length > 0) {
      const bookmarkGroup = document.createElement('div');
      bookmarkGroup.className = 'btn-group me-2';
      
      this.bookmarks.forEach((bm) => {
          const btn = document.createElement('button');
          const isActive = bm.name === this.activeBookmark;
          btn.className = isActive ? 'btn btn-sm btn-secondary' : 'btn btn-sm btn-outline-secondary';
          btn.textContent = bm.name;
          btn.onclick = () => {
            this.activeBookmark = bm.name;
            this.updateUI();
            this.onApplyState(bm.state);
          };
          bookmarkGroup.appendChild(btn);
      });
      toolbar.appendChild(bookmarkGroup);
    }

    // Control buttons group (bookmark, manage, reset)
    const controlGroup = document.createElement('div');
    controlGroup.className = 'btn-group ms-auto bookmark-toolbar-controls';

    const addBtn = document.createElement('button');
    addBtn.className = 'btn btn-sm btn-outline-secondary';
    addBtn.innerHTML = `<i class="fas fa-bookmark"></i>`;
    addBtn.title = "Bookmark this view";
    addBtn.onclick = () => this.showAddModal();
    controlGroup.appendChild(addBtn);

    // Edit button (only if bookmarks exist)
    if (this.bookmarks.length > 0) {
        const editBtn = document.createElement('button');
        editBtn.className = 'btn btn-sm btn-outline-secondary';
        editBtn.innerHTML = `<i class="fas fa-cog"></i>`;
        editBtn.title = "Manage Bookmarks";
        editBtn.onclick = () => this.showManageModal();
        controlGroup.appendChild(editBtn);
    }

    // Reset button (always displayed if callback provided)
    if (this.onResetFilters) {
      const resetBtn = document.createElement('button');
      resetBtn.className = 'btn btn-sm btn-outline-secondary';
      resetBtn.innerHTML = `<i class="fa-solid fa-circle-xmark"></i>`;
      resetBtn.title = "Reset all filters";
      resetBtn.onclick = () => {
        this.activeBookmark = null;
        this.updateUI();
        this.onResetFilters!();
      };
      controlGroup.appendChild(resetBtn);
    }
    
    toolbar.appendChild(controlGroup);

    this.currentContainer.appendChild(toolbar);
  }

  private showManageModal() {
    const modalId = 'manage-bookmarks-modal';
    const existingModal = document.getElementById(modalId);
    if (existingModal) existingModal.remove();

    // Clone bookmarks for local editing
    let tempBookmarks = [...this.bookmarks];

    const renderList = (container: HTMLElement) => {
        container.innerHTML = '';
        if (tempBookmarks.length === 0) {
            container.innerHTML = '<p class="text-muted text-center my-3">No bookmarks saved.</p>';
            return;
        }

        const listGroup = document.createElement('ul');
        listGroup.className = 'list-group';

        tempBookmarks.forEach((bm, index) => {
            const li = document.createElement('li');
            li.className = 'list-group-item d-flex justify-content-between align-items-center';
            
            const nameSpan = document.createElement('span');
            nameSpan.textContent = bm.name;
            li.appendChild(nameSpan);

            const btnGroup = document.createElement('div');
            btnGroup.className = 'btn-group btn-group-sm';

            // Up
            const upBtn = document.createElement('button');
            upBtn.className = 'btn btn-outline-secondary';
            upBtn.innerHTML = '<i class="fas fa-arrow-up"></i>';
            upBtn.title = "Move Up";
            upBtn.disabled = index === 0;
            upBtn.onclick = () => {
                [tempBookmarks[index - 1], tempBookmarks[index]] = [tempBookmarks[index], tempBookmarks[index - 1]];
                renderList(container);
            };
            btnGroup.appendChild(upBtn);

            // Down
            const downBtn = document.createElement('button');
            downBtn.className = 'btn btn-outline-secondary';
            downBtn.innerHTML = '<i class="fas fa-arrow-down"></i>';
            downBtn.title = "Move Down";
            downBtn.disabled = index === tempBookmarks.length - 1;
            downBtn.onclick = () => {
                [tempBookmarks[index + 1], tempBookmarks[index]] = [tempBookmarks[index], tempBookmarks[index + 1]];
                renderList(container);
            };
            btnGroup.appendChild(downBtn);

            // Save Current View
            const saveViewBtn = document.createElement('button');
            saveViewBtn.className = 'btn btn-outline-secondary';
            saveViewBtn.innerHTML = '<i class="fas fa-floppy-disk"></i>';
            saveViewBtn.title = "Save Current View";
            saveViewBtn.onclick = () => {
                if (confirm(`Are you sure you want to replace the state of "${bm.name}" with the current view settings?`)) {
                    const state = this.onGetState();
                    const stateClone = JSON.parse(JSON.stringify(state));
                    tempBookmarks[index].state = stateClone;
                    renderList(container);
                    this.showUpdateConfirmation(bm.name, modal);
                }
            };
            btnGroup.appendChild(saveViewBtn);

            // Edit
            const editBtn = document.createElement('button');
            editBtn.className = 'btn btn-outline-secondary';
            editBtn.innerHTML = '<i class="fas fa-pen"></i>';
            editBtn.title = "Rename";
            editBtn.onclick = () => {
                const newName = prompt("Enter new name:", bm.name);
                if (newName && newName.trim()) {
                    tempBookmarks[index].name = newName.trim();
                    renderList(container);
                }
            };
            btnGroup.appendChild(editBtn);

            // Delete
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'btn btn-outline-danger';
            deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
            deleteBtn.title = "Delete";
            deleteBtn.onclick = () => {
                if (confirm(`Delete bookmark "${bm.name}"?`)) {
                    tempBookmarks.splice(index, 1);
                    renderList(container);
                }
            };
            btnGroup.appendChild(deleteBtn);

            li.appendChild(btnGroup);
            listGroup.appendChild(li);
        });
        container.appendChild(listGroup);
    };

    const modalHtml = `
      <div class="modal fade" id="${modalId}" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">Manage Bookmarks</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body">
              <div id="bookmarks-list-container"></div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
              <button type="button" class="btn btn-success" id="save-manage-btn">Save</button>
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
    
    const listContainer = document.getElementById('bookmarks-list-container')!;
    renderList(listContainer);

    const saveBtn = document.getElementById('save-manage-btn');
    saveBtn?.addEventListener('click', () => {
        this.bookmarks = tempBookmarks;
        this.saveBookmarks();
        this.updateUI();
        modal.hide();
    });

    modalElement.addEventListener('hidden.bs.modal', () => {
      setTimeout(() => {
        container.remove();
      }, 300);
    });

    modal.show();
  }

  private async showAddModal() {
    const modalId = 'add-bookmark-modal';
    const existingModal = document.getElementById(modalId);
    if (existingModal) {
      existingModal.remove();
    }

    const modalHtml = `
      <div class="modal fade" id="${modalId}" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">Add Bookmark</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body">
              <p class="text-muted small">Save the current sort and filter configuration as a bookmark for quick access later.</p>
              <div class="mb-3">
                <label for="bookmark-name" class="form-label">Name</label>
                <input type="text" class="form-control" id="bookmark-name" placeholder="e.g. High Value Trades">
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
              <button type="button" class="btn btn-success" id="save-bookmark-btn">Save</button>
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
    const saveBtn = document.getElementById('save-bookmark-btn');
    const input = document.getElementById('bookmark-name') as HTMLInputElement;

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        saveBtn?.click();
      }
    });

    saveBtn?.addEventListener('click', () => {
      const name = input.value.trim();
      if (name) {
        const state = this.onGetState();
        // Clone the state to avoid reference issues
        const stateClone = JSON.parse(JSON.stringify(state));
        this.bookmarks.push({ name, state: stateClone });
        this.saveBookmarks();
        this.updateUI();
        modal.hide();
      }
    });

    modalElement.addEventListener('hidden.bs.modal', () => {
      setTimeout(() => {
        container.remove();
      }, 300);
    });

    modal.show();
    // Focus input after modal is shown
    modalElement.addEventListener('shown.bs.modal', () => {
        input.focus();
    });
  }

  private showUpdateConfirmation(bookmarkName: string, manageModal: any) {
    const confirmModalId = 'bookmark-updated-modal';
    const existingConfirmModal = document.getElementById(confirmModalId);
    if (existingConfirmModal) {
      existingConfirmModal.remove();
    }

    const confirmModalHtml = `
      <div class="modal fade" id="${confirmModalId}" tabindex="-1" aria-hidden="true" data-bs-backdrop="static" data-bs-keyboard="false">
        <div class="modal-dialog modal-dialog-centered modal-sm">
          <div class="modal-content">
            <div class="modal-header border-0 pb-0">
              <h5 class="modal-title">Bookmark Updated</h5>
            </div>
            <div class="modal-body pt-2">
              <p class="mb-0">The bookmark "<strong>${bookmarkName}</strong>" has been updated with the current view settings.</p>
            </div>
          </div>
        </div>
      </div>
    `;

    const confirmContainer = document.createElement('div');
    confirmContainer.innerHTML = confirmModalHtml;
    document.body.appendChild(confirmContainer);

    const confirmModalElement = document.getElementById(confirmModalId)!;
    const confirmModal = new (window as any).bootstrap.Modal(confirmModalElement);

    confirmModalElement.addEventListener('hidden.bs.modal', () => {
      setTimeout(() => {
        confirmContainer.remove();
        // Close the manage modal and return to the view
        manageModal.hide();
      }, 300);
    });

    confirmModal.show();
    
    // Auto-dismiss after 1 second
    setTimeout(() => {
      confirmModal.hide();
    }, 1000);
  }
}

(window as any).BookmarkBar = BookmarkBar;
