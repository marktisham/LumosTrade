interface DropdownOption {
  value: string;
  label: string;
  group?: string;
    labelHtml?: string;
}

function createSearchableDropdown(
  options: DropdownOption[],
  selectedValue: string | null,
  defaultLabel: string,
  onChange: (value: string | null) => void
): HTMLElement {
  const container = document.createElement('div');
  container.className = 'dropdown';

  const button = document.createElement('button');
  button.className = 'btn btn-sm btn-outline-secondary dropdown-toggle w-100 text-start d-flex justify-content-between align-items-center';
  button.type = 'button';
  button.setAttribute('data-bs-toggle', 'dropdown');
  button.setAttribute('aria-expanded', 'false');
  button.style.color = '#e8e8e8';
  
  const selectedOption = options.find(o => o.value === selectedValue);
  const buttonLabel = document.createElement('span');
  buttonLabel.className = 'text-truncate';
  buttonLabel.style.color = '#e8e8e8';
    if (selectedOption?.labelHtml) {
        buttonLabel.innerHTML = selectedOption.labelHtml;
    } else {
        buttonLabel.textContent = selectedOption ? selectedOption.label : defaultLabel;
    }
  button.appendChild(buttonLabel);
  
  container.appendChild(button);

  const menu = document.createElement('div');
  menu.className = 'dropdown-menu p-0 shadow-sm';
  menu.style.minWidth = '280px';
  menu.style.maxHeight = '400px';
  menu.style.overflowY = 'auto';

  // Search Input
  const searchContainer = document.createElement('div');
  searchContainer.className = 'p-2 sticky-top border-bottom';
  searchContainer.style.backgroundColor = '#1f1f1f';
  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.className = 'form-control form-control-sm';
  searchInput.placeholder = 'Search...';
  searchInput.style.backgroundColor = '#2d2d2d';
  searchInput.style.borderColor = '#454545';
  searchInput.style.color = '#e8e8e8';
  searchContainer.appendChild(searchInput);
  menu.appendChild(searchContainer);

  const itemsContainer = document.createElement('div');
  menu.appendChild(itemsContainer);

  const renderItems = (filterText: string) => {
    itemsContainer.innerHTML = '';
    const lowerFilter = filterText.toLowerCase();
    
    // Always add "All" option if it matches filter or filter is empty
    if ('all'.includes(lowerFilter) || defaultLabel.toLowerCase().includes(lowerFilter) || filterText === '') {
        const allItem = document.createElement('a');
        allItem.className = `dropdown-item fw-bold ${selectedValue === null ? 'active' : ''}`;
        allItem.href = '#';
        allItem.textContent = defaultLabel;
        allItem.onclick = (e) => {
            e.preventDefault();
            onChange(null);
        };
        itemsContainer.appendChild(allItem);
        
        const divider = document.createElement('div');
        divider.className = 'dropdown-divider';
        itemsContainer.appendChild(divider);
    }

    const filteredOptions = options.filter(o => o.label.toLowerCase().includes(lowerFilter));
    
    // Grouping logic
    const groups: { [key: string]: DropdownOption[] } = {};
    let hasGroups = false;
    
    filteredOptions.forEach(opt => {
        const groupName = opt.group || 'Other';
        if (opt.group) hasGroups = true;
        if (!groups[groupName]) groups[groupName] = [];
        groups[groupName].push(opt);
    });

    const groupKeys = Object.keys(groups).sort();
    if (hasGroups) {
        const showHeaders = groupKeys.length > 1;
        groupKeys.forEach(groupName => {
            if (showHeaders) {
                const header = document.createElement('h6');
                header.className = 'dropdown-header fw-bold fst-italic';
                header.style.color = '#8b95a3';
                header.style.backgroundColor = '#252525';
                header.textContent = groupName;
                itemsContainer.appendChild(header);
            }
            
            groups[groupName].forEach(opt => {
                addItem(opt);
            });
        });
    } else {
        filteredOptions.forEach(opt => addItem(opt));
    }
    
    if (filteredOptions.length === 0 && itemsContainer.children.length === 0) {
        const noResults = document.createElement('div');
        noResults.className = 'dropdown-item disabled';
        noResults.textContent = 'No results found';
        itemsContainer.appendChild(noResults);
    }
  };

  const addItem = (opt: DropdownOption) => {
      const item = document.createElement('a');
      item.className = `dropdown-item ${opt.value === selectedValue ? 'active' : ''}`;
      item.href = '#';
            if (opt.labelHtml) {
                item.innerHTML = opt.labelHtml;
            } else {
                item.textContent = opt.label;
            }
      item.onclick = (e) => {
          e.preventDefault();
          onChange(opt.value);
      };
      itemsContainer.appendChild(item);
  };

  renderItems('');

  searchInput.addEventListener('input', (e) => {
      renderItems((e.target as HTMLInputElement).value);
  });
  
  // Prevent dropdown from closing when clicking input
  searchContainer.addEventListener('click', (e) => e.stopPropagation());

  container.appendChild(menu);
  return container;
}
