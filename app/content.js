// Track if we're programmatically opening the dropdown
let isProgrammaticClick = false;

// CSS to hide dropdowns only during our programmatic interactions
const style = document.createElement('style');
style.textContent = `
  [id^="ds--dropdown"][data-placement].jira-ext-hidden {
    opacity: 0 !important;
    pointer-events: none !important;
    transition: none !important;
  }
  /* Blue circle only for avatars added by extension */
  [data-extension-avatar] [data-component-selector="avatar-border"] {
    box-shadow: none !important;
    outline: none !important;
    border: none !important;
  }
  [data-extension-avatar] [data-component-selector="avatar-border"] * {
    box-shadow: none !important;
  }
  [data-extension-avatar] input[name="assignee"]:checked + [data-component-selector="avatar-border"] label span span[data-testid$="ak-avatar--inner"] {
    outline: 2px solid #0052CC !important;
    outline-offset: 2px !important;
    border-radius: 50% !important;
  }
  /* Hide assignee filter until extension has processed it */
  [data-testid="filters.ui.filters.assignee.stateless.assignee-filter"]:not([data-extension-ready]) {
    opacity: 0 !important;
  }
  [data-testid="filters.ui.filters.assignee.stateless.assignee-filter"][data-extension-ready] {
    opacity: 1 !important;
    transition: opacity 0.15s ease-in !important;
  }
`;
document.head.appendChild(style);

// Watch for dropdowns and hide them if we triggered the click
const dropdownObserver = new MutationObserver(() => {
  if (isProgrammaticClick) {
    const dropdown = document.querySelector('[id^="ds--dropdown"][data-placement]:not(.jira-ext-hidden)');
    if (dropdown) {
      dropdown.classList.add('jira-ext-hidden');
    }
  }
});
dropdownObserver.observe(document.body, { childList: true, subtree: true });

/**
 * Main function: Expands the hidden assignees (+N button) into visible avatars
 */
function expandAssignees() {
  const showMoreBtn = document.querySelector('[data-testid="filters.ui.filters.assignee.stateless.show-more-button.assignee-filter-show-more"]');
  const fieldset = document.querySelector('[data-testid="filters.ui.filters.assignee.stateless.assignee-filter"]');
  
  if (!showMoreBtn && fieldset) {
    fieldset.setAttribute('data-extension-ready', 'true');
    return;
  }
  
  if (!showMoreBtn || showMoreBtn.dataset.expanded === 'true') return;
  
  showMoreBtn.dataset.expanded = 'true';
  
  // Mark that we're doing a programmatic click
  isProgrammaticClick = true;
  showMoreBtn.click();

  setTimeout(() => {
    const dropdown = document.querySelector('[id^="ds--dropdown"]');
    if (!dropdown) {
      showMoreBtn.dataset.expanded = 'false';
      isProgrammaticClick = false;
      if (fieldset) fieldset.setAttribute('data-extension-ready', 'true');
      return;
    }

    const menuItems = dropdown.querySelectorAll('button[role="menuitemcheckbox"]');
    const existingInput = fieldset.querySelector('input[name="assignee"]');
    const existingWrapper = existingInput?.closest('div[style*="--_"]');
    
    if (!existingWrapper || !existingWrapper.parentElement) {
      isProgrammaticClick = false;
      if (fieldset) fieldset.setAttribute('data-extension-ready', 'true');
      return;
    }

    const container = existingWrapper.parentElement;
    const btnParent = showMoreBtn.parentElement;
    const newAvatars = [];

    menuItems.forEach(item => {
      const userId = item.id;
      if (userId === 'unassigned') return;
      
      const isSelected = item.getAttribute('aria-checked') === 'true';
      const img = item.querySelector('img');
      const nameEl = item.querySelector('[role="presentation"] + div');
      if (!img) return;

      const name = nameEl?.textContent || '';
      const imgSrc = img.src;

      const newWrapper = existingWrapper.cloneNode(true);
      newWrapper.setAttribute('data-extension-avatar', 'true');
      
      const newInput = newWrapper.querySelector('input');
      const newImg = newWrapper.querySelector('img');
      const newLabel = newWrapper.querySelector('label');

      if (newInput) {
        newInput.id = `assignee-${userId}`;
        newInput.value = userId;
        newInput.checked = isSelected;
        newInput.setAttribute('aria-label', `Filter assignees by ${name}`);
      }
      if (newImg) newImg.src = imgSrc;
      if (newLabel) newLabel.setAttribute('for', `assignee-${userId}`);

      newWrapper.style.cursor = 'pointer';
      
      newWrapper.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        if (newInput) {
          newInput.checked = !newInput.checked;
        }
        
        // Mark as programmatic click before opening dropdown
        isProgrammaticClick = true;
        showMoreBtn.click();
        
        setTimeout(() => {
          const dd = document.querySelector('[id^="ds--dropdown"]');
          if (dd) {
            const targetBtn = dd.querySelector(`button#${CSS.escape(userId)}`);
            if (targetBtn) targetBtn.click();
          }
          setTimeout(() => {
            document.body.click();
            const remaining = document.querySelector('[id^="ds--dropdown"]');
            if (remaining) remaining.remove();
            isProgrammaticClick = false;
          }, 50);
        }, 100);
      });

      newAvatars.push(newWrapper);
    });

    showMoreBtn.click();
    setTimeout(() => {
      const remainingDropdown = document.querySelector('[id^="ds--dropdown"]');
      if (remainingDropdown) remainingDropdown.remove();
      isProgrammaticClick = false;
    }, 50);

    setTimeout(() => {
      newAvatars.forEach(avatar => {
        container.appendChild(avatar);
      });
      if (btnParent) btnParent.style.display = 'none';
      if (fieldset) fieldset.setAttribute('data-extension-ready', 'true');
    }, 100);
    
  }, 100);
}

const observer = new MutationObserver(() => setTimeout(expandAssignees, 500));
observer.observe(document.body, { childList: true, subtree: true });

setTimeout(expandAssignees, 1000);
