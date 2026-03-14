// CSS to hide dropdowns during programmatic interactions (prevents flashing)
const style = document.createElement('style');
style.textContent = `
  [id^="ds--dropdown"][data-placement] {
    opacity: 0 !important;
    pointer-events: none !important;
    transition: none !important;
  }
  [id^="ds--dropdown"][data-placement].jira-ext-visible {
    opacity: 1 !important;
    pointer-events: auto !important;
  }
`;
document.head.appendChild(style);

/**
 * Main function: Expands the hidden assignees (+N button) into visible avatars
 * It opens the dropdown, extracts avatar data, creates new avatar elements,
 * and adds them to the filter bar.
 */
function expandAssignees() {
  // Find the "+N" button that shows overflow assignees
  const showMoreBtn = document.querySelector('[data-testid="filters.ui.filters.assignee.stateless.show-more-button.assignee-filter-show-more"]');
  
  // Exit if button doesn't exist or we've already expanded
  if (!showMoreBtn || showMoreBtn.dataset.expanded === 'true') return;
  
  // Mark as expanded to prevent running multiple times
  showMoreBtn.dataset.expanded = 'true';
  
  // Programmatically click to open the dropdown (hidden via CSS)
  showMoreBtn.click();

  setTimeout(() => {
    // Find the dropdown that contains hidden assignees
    const dropdown = document.querySelector('[id^="ds--dropdown"]');
    if (!dropdown) {
      showMoreBtn.dataset.expanded = 'false';
      return;
    }

    // Get all assignee buttons from the dropdown menu
    const menuItems = dropdown.querySelectorAll('button[role="menuitemcheckbox"]');
    
    // Find the assignee filter container using stable data-testid
    const fieldset = document.querySelector('[data-testid="filters.ui.filters.assignee.stateless.assignee-filter"]');
    
    // Find an existing avatar input to use as a template for cloning
    const existingInput = fieldset.querySelector('input[name="assignee"]');
    const existingWrapper = existingInput?.closest('div[style*="--_"]');
    
    if (!existingWrapper || !existingWrapper.parentElement) return;

    // Container where all avatar wrappers live
    const container = existingWrapper.parentElement;
    
    // The +N button's parent element (will be hidden later)
    const btnParent = showMoreBtn.parentElement;

    // Array to store newly created avatar elements
    const newAvatars = [];

    // Loop through each dropdown item and create a visible avatar
    menuItems.forEach(item => {
      // User ID from the button's id attribute
      const userId = item.id;
      
      // Skip the "Unassigned" option
      if (userId === 'unassigned') return;
      
      // Extract avatar image and name from dropdown item
      const img = item.querySelector('img');
      const nameEl = item.querySelector('[role="presentation"] + div');
      if (!img) return;

      const name = nameEl?.textContent || '';
      const imgSrc = img.src;

      // Clone an existing avatar wrapper to maintain consistent styling
      const newWrapper = existingWrapper.cloneNode(true);
      
      // Update the cloned element with this user's data
      const newInput = newWrapper.querySelector('input');
      const newImg = newWrapper.querySelector('img');
      const newLabel = newWrapper.querySelector('label');

      if (newInput) {
        newInput.id = `assignee-${userId}`;
        newInput.value = userId;
        newInput.setAttribute('aria-label', `Filter assignees by ${name}`);
      }
      if (newImg) newImg.src = imgSrc;
      if (newLabel) newLabel.setAttribute('for', `assignee-${userId}`);

      // Make the avatar clickable
      newWrapper.style.cursor = 'pointer';
      
      // Click handler: opens dropdown, clicks the corresponding user, closes dropdown
      newWrapper.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        // Open the dropdown (hidden via CSS)
        showMoreBtn.click();
        
        setTimeout(() => {
          const dd = document.querySelector('[id^="ds--dropdown"]');
          if (dd) {
            // Find and click the matching user button in dropdown
            const targetBtn = dd.querySelector(`button#${CSS.escape(userId)}`);
            if (targetBtn) targetBtn.click();
          }
          // Close dropdown and clean up
          setTimeout(() => {
            document.body.click();
            const remaining = document.querySelector('[id^="ds--dropdown"]');
            if (remaining) remaining.remove();
          }, 50);
        }, 100);
      });

      newAvatars.push(newWrapper);
    });

    // Close the dropdown we opened for data extraction
    showMoreBtn.click();
    setTimeout(() => {
      const remainingDropdown = document.querySelector('[id^="ds--dropdown"]');
      if (remainingDropdown) remainingDropdown.remove();
    }, 50);

    // Add the new avatar elements to the filter bar
    setTimeout(() => {
      newAvatars.forEach(avatar => {
        container.appendChild(avatar);
      });
      // Hide the +N button since all avatars are now visible
      if (btnParent) btnParent.style.display = 'none';
    }, 100);
    
  }, 100);
}

// Watch for DOM changes (Jira is a SPA, content loads dynamically)
const observer = new MutationObserver(() => setTimeout(expandAssignees, 500));
observer.observe(document.body, { childList: true, subtree: true });

// Initial run after page load
setTimeout(expandAssignees, 1000);
