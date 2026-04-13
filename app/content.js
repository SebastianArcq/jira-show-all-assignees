/**
 * Jira Show All Assignees Extension
 * 
 * This extension expands the hidden assignee avatars in Jira board filters.
 * By default, Jira only shows six assignees and hides the rest behind a "+N" button.
 * This extension automatically expands all assignees into a single row.
 */

/**
 * Checks if the current page is a Jira board.
 * We only want to run this extension on board pages to avoid interfering
 * with other Jira/Atlassian pages like Confluence or Jira issues.
 * 
 * returns {boolean} True if URL contains '/boards/'
 */
function isJiraBoard() {
  return window.location.pathname.includes('/boards/');
}

/**
 * Flag to track when we're programmatically clicking the +N button.
 * This prevents our dropdown-hiding CSS from affecting dropdowns
 * that the user opens manually (like other menus in Jira).
 */
let isProgrammaticClick = false;

/**
 * CSS styles injected into the page.
 * 
 * These styles handle:
 * 1. Hiding dropdowns during programmatic clicks (prevents flash)
 * 2. Blue selection circle for extension-added avatars
 * 3. Hiding the assignee filter until extension finishes loading (prevents flash of +N button)
 */
const style = document.createElement('style');
style.textContent = `
  /* Hide dropdowns only when we trigger them programmatically */
  [id^="ds--dropdown"][data-placement].jira-ext-hidden {
    opacity: 0 !important;
    pointer-events: none !important;
    transition: none !important;
  }

  /* Reset any existing border styles on extension-added avatars */
  [data-extension-avatar] [data-component-selector="avatar-border"] {
    box-shadow: none !important;
    outline: none !important;
    border: none !important;
  }
  [data-extension-avatar] [data-component-selector="avatar-border"] * {
    box-shadow: none !important;
  }

  /* Blue selection circle for extension-added avatars when checked */
  [data-extension-avatar] input[name="assignee"]:checked + [data-component-selector="avatar-border"] label span span[data-testid$="ak-avatar--inner"] {
    outline: 2px solid #0052CC !important;
    outline-offset: 2px !important;
    border-radius: 50% !important;
  }

  /* Hide the assignee filter until the extension has processed it */
  [data-testid="filters.ui.filters.assignee.stateless.assignee-filter"]:not([data-extension-ready]) {
    opacity: 0 !important;
  }

  /* Fade in the assignee filter once the extension is done */
  [data-testid="filters.ui.filters.assignee.stateless.assignee-filter"][data-extension-ready] {
    opacity: 1 !important;
    transition: opacity 0.15s ease-in !important;
  }
`;

// Only inject CSS on board pages to avoid side effects elsewhere
if (isJiraBoard()) {
  document.head.appendChild(style);
}

/**
 * MutationObserver to watch for dropdown elements appearing in the DOM.
 * When we programmatically click the +N button, this hides the dropdown
 * before it becomes visible, preventing a flash.
 */
const dropdownObserver = new MutationObserver(() => {
  // Only hide dropdowns if we triggered the click (not user clicks)
  if (isProgrammaticClick) {
    const dropdown = document.querySelector('[id^="ds--dropdown"][data-placement]:not(.jira-ext-hidden)');
    if (dropdown) {
      dropdown.classList.add('jira-ext-hidden');
    }
  }
});

// Only observe on board pages
if (isJiraBoard()) {
  dropdownObserver.observe(document.body, { childList: true, subtree: true });
}

/**
 * Main function: Expands the hidden assignees (+N button) into visible avatars.
 * 
 * How it works:
 * 1. Finds the "+N" button that hides overflow assignees
 * 2. Programmatically clicks it to load the dropdown (hidden via CSS)
 * 3. Extracts user data (id, name, avatar URL, selected state) from dropdown
 * 4. Clones an existing avatar element for each hidden user
 * 5. Updates the cloned element with the user's data
 * 6. Adds click handlers to make the new avatars functional
 * 7. Appends the new avatars to the filter bar
 * 8. Hides the +N button since all avatars are now visible
 */
function expandAssignees() {
  // Exit early if not on a board page
  if (!isJiraBoard()) return;

  // Find the "+N" button (e.g., "+4") that shows overflow assignees
  const showMoreBtn = document.querySelector('[data-testid="filters.ui.filters.assignee.stateless.show-more-button.assignee-filter-show-more"]');
  
  // Find the assignee filter container (the fieldset wrapping all avatars)
  const fieldset = document.querySelector('[data-testid="filters.ui.filters.assignee.stateless.assignee-filter"]');
  
  // If there's no +N button but the fieldset exists, just show it
  // This handles boards with fewer assignees that don't need expanding
  if (!showMoreBtn && fieldset) {
    fieldset.setAttribute('data-extension-ready', 'true');
    return;
  }
  
  // Exit if button doesn't exist or we've already processed it
  if (!showMoreBtn || showMoreBtn.dataset.expanded === 'true') return;
  
  // Mark as expanded to prevent running multiple times on the same page
  showMoreBtn.dataset.expanded = 'true';
  
  // Set flag so our dropdown observer knows to hide the dropdown
  isProgrammaticClick = true;
  
  // Click to open the dropdown (it will be hidden by our CSS)
  showMoreBtn.click();

  // Wait for dropdown to appear in DOM
  setTimeout(() => {
    // Find the dropdown containing hidden assignees
    const dropdown = document.querySelector('[id^="ds--dropdown"]');
    
    // If dropdown didn't appear, reset and show the filter
    if (!dropdown) {
      showMoreBtn.dataset.expanded = 'false';
      isProgrammaticClick = false;
      if (fieldset) fieldset.setAttribute('data-extension-ready', 'true');
      return;
    }

    // Get all assignee buttons from the dropdown menu
    // Each button has role="menuitemcheckbox" and contains user data
    const menuItems = dropdown.querySelectorAll('button[role="menuitemcheckbox"]');
    
    // Find an existing visible avatar to use as a template for cloning
    // We clone instead of creating from scratch to maintain Jira's styling
    const existingInput = fieldset.querySelector('input[name="assignee"]');
    const existingWrapper = existingInput?.closest('div[style*="--_"]');
    
    // If we can't find a template, show the filter and exit
    if (!existingWrapper || !existingWrapper.parentElement) {
      isProgrammaticClick = false;
      if (fieldset) fieldset.setAttribute('data-extension-ready', 'true');
      return;
    }

    // The container where all avatar wrappers are placed
    const container = existingWrapper.parentElement;
    
    // The +N button's parent element (will be hidden at the end)
    const btnParent = showMoreBtn.parentElement;
    
    // Array to store newly created avatar elements
    const newAvatars = [];

    // Loop through each user in the dropdown and create a visible avatar
    menuItems.forEach(item => {
      // User ID from the button's id attribute (used for filtering)
      const userId = item.id;
      
      // Skip the "Unassigned" option as it's not a real user
      if (userId === 'unassigned') return;
      
      // Check if this user is already selected (from URL params on page load)
      // The dropdown button has aria-checked="true" when selected
      const isSelected = item.getAttribute('aria-checked') === 'true';
      
      // Extract avatar image URL from dropdown
      const img = item.querySelector('img');
      
      // Extract user name from dropdown
      const nameEl = item.querySelector('[role="presentation"] + div');
      
      // Skip if no image found (shouldn't happen, but safety check)
      if (!img) return;

      const name = nameEl?.textContent || '';
      const imgSrc = img.src;

      // Clone an existing avatar wrapper to maintain Jira's styling
      const newWrapper = existingWrapper.cloneNode(true);
      
      // Mark this avatar as extension-added for CSS targeting
      // This prevents our styles from affecting original avatars
      newWrapper.setAttribute('data-extension-avatar', 'true');
      
      // Find elements within the clone to update with user data
      const newInput = newWrapper.querySelector('input');
      const newImg = newWrapper.querySelector('img');
      const newLabel = newWrapper.querySelector('label');

      // Update the hidden checkbox with user's data
      // This checkbox controls the filter state
      if (newInput) {
        newInput.id = `assignee-${userId}`;
        newInput.value = userId;
        newInput.checked = isSelected; // Restore selection state from URL
        newInput.setAttribute('aria-label', `Filter assignees by ${name}`);
      }
      
      // Update avatar image
      if (newImg) newImg.src = imgSrc;
      
      // Update label's for attribute to match the new input id
      if (newLabel) newLabel.setAttribute('for', `assignee-${userId}`);

      // Make the avatar look clickable
      newWrapper.style.cursor = 'pointer';
      
      /**
       * Click handler for the avatar.
       * When clicked, it:
       * 1. Toggles the visual checkbox state (blue circle)
       * 2. Opens the hidden dropdown
       * 3. Clicks the corresponding user in the dropdown (triggers Jira's filter)
       * 4. Closes the dropdown
       */
      newWrapper.addEventListener('click', (e) => {
        // Prevent default behavior and stop event bubbling
        e.preventDefault();
        e.stopPropagation();
        
        // Toggle the checkbox for immediate visual feedback (blue circle)
        if (newInput) {
          newInput.checked = !newInput.checked;
        }
        
        // Mark as programmatic click to hide the dropdown
        isProgrammaticClick = true;
        
        // Open the dropdown (hidden via CSS)
        showMoreBtn.click();
        
        // Wait for dropdown to appear, then click the user
        setTimeout(() => {
          const dd = document.querySelector('[id^="ds--dropdown"]');
          if (dd) {
            // Find the user's button in the dropdown and click it
            // CSS.escape handles special characters in user IDs
            const targetBtn = dd.querySelector(`button#${CSS.escape(userId)}`);
            if (targetBtn) targetBtn.click();
          }
          
          // Close the dropdown and clean up
          setTimeout(() => {
            document.body.click(); // Close dropdown
            const remaining = document.querySelector('[id^="ds--dropdown"]');
            if (remaining) remaining.remove(); // Remove from DOM
            isProgrammaticClick = false; // Reset flag
          }, 50);
        }, 100);
      });

      // Add to our list of new avatars
      newAvatars.push(newWrapper);
    });

    // Close the dropdown we opened for data extraction
    showMoreBtn.click();
    
    // Remove dropdown from DOM after it closes
    setTimeout(() => {
      const remainingDropdown = document.querySelector('[id^="ds--dropdown"]');
      if (remainingDropdown) remainingDropdown.remove();
      isProgrammaticClick = false;
    }, 50);

    // Add the new avatar elements to the filter bar
    setTimeout(() => {
      // Append each new avatar to the container
      newAvatars.forEach(avatar => {
        container.appendChild(avatar);
      });
      
      // Hide the +N button since all avatars are now visible
      if (btnParent) btnParent.style.display = 'none';
      
      // Mark the filter as ready, triggering the fade-in CSS
      if (fieldset) fieldset.setAttribute('data-extension-ready', 'true');
    }, 100);
    
  }, 100); // Wait for dropdown to appear
}

/**
 * MutationObserver to watch for DOM changes.
 * Jira is a Single Page Application (SPA), so content loads dynamically.
 * This observer re-runs expandAssignees when the page content changes,
 * such as when navigating between boards.
 */
const observer = new MutationObserver(() => {
  if (isJiraBoard()) {
    setTimeout(expandAssignees, 500);
  }
});
observer.observe(document.body, { childList: true, subtree: true });

// Initial run after page load
if (isJiraBoard()) {
  setTimeout(expandAssignees, 1000);
}
