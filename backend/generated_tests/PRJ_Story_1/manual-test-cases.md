# Manual Test Cases - CLI input

Story title: View List of Products

## Story Acceptance Criteria
- AC1: The user can navigate to the product listing page
- AC2: The product list is displayed with at least product name and basic product information
- AC3: The product list loads within an acceptable time frame
- AC4: When no products are available, an appropriate empty state message is shown
- AC5: The product list is scrollable when items exceed the visible viewport
- AC6: Each product item in the list is visually distinct and readable
- AC7: The product list is accessible and usable on both desktop and mobile viewports
- AC8: The product list reflects the current state of available products

## Manual Test Cases

### PRJ_Story_1_TestCase_1 - Display product list with multiple products available
- Type: functional
- Priority: high
- Automation candidate: Yes
- Automation reason: Stable UI behavior with verifiable DOM elements and product count assertions in Playwright
- Preconditions:
  - User is authenticated and logged in
  - At least 3 products exist in the database
  - User is on the application home page
- Steps:
  1. Navigate to the product listing page via the main navigation menu or direct URL
  2. Wait for the page to fully load
  3. Observe the product list area
- Expected result: The product listing page is displayed showing all available products, each with at least a product name and basic information visible. The number of products shown matches the number of products in the system.
- Acceptance criteria covered:
  - AC1
  - AC2
  - AC8

### PRJ_Story_1_TestCase_2 - Product list loads within acceptable time threshold
- Type: functional
- Priority: high
- Automation candidate: Yes
- Automation reason: Playwright can measure page load timing and assert against threshold values using performance APIs
- Preconditions:
  - User is authenticated and logged in
  - At least 10 products exist in the database
  - Network is on a standard broadband connection (no throttling)
  - Browser cache is cleared
- Steps:
  1. Open browser developer tools and go to the Network tab
  2. Navigate to the product listing page
  3. Record the total page load time from the Network tab
  4. Observe when product list items become visible on screen
- Expected result: The product list page fully loads and products are visible within 3 seconds. The network requests complete without timeout errors.
- Acceptance criteria covered:
  - AC3

### PRJ_Story_1_TestCase_3 - Empty state displayed when no products are available
- Type: edge
- Priority: high
- Automation candidate: Yes
- Automation reason: Empty state message presence and text can be asserted deterministically in Playwright
- Preconditions:
  - User is authenticated and logged in
  - There are zero products in the database
  - User is on the application home page
- Steps:
  1. Navigate to the product listing page via the main navigation menu or direct URL
  2. Wait for the page to fully load
  3. Observe the product list area
- Expected result: An empty state message is displayed (e.g., 'No products available' or similar) instead of a blank page or error. No broken layout elements are visible.
- Acceptance criteria covered:
  - AC4

### PRJ_Story_1_TestCase_4 - Product list is scrollable when items exceed viewport height
- Type: functional
- Priority: high
- Automation candidate: Yes
- Automation reason: Playwright supports scroll actions and visibility assertions for elements below the fold
- Preconditions:
  - User is authenticated and logged in
  - More than 20 products exist in the database to overflow the viewport
  - User is on the product listing page
- Steps:
  1. Navigate to the product listing page
  2. Wait for the page to fully load
  3. Note the last visible product item without scrolling
  4. Scroll down using the mouse wheel or scrollbar
  5. Continue scrolling to the bottom of the list
  6. Note the products visible after scrolling
- Expected result: The page or list container is scrollable. Products that were not visible in the initial viewport become visible after scrolling. All products are reachable by scrolling.
- Acceptance criteria covered:
  - AC5

### PRJ_Story_1_TestCase_5 - Each product item is visually distinct and readable
- Type: usability
- Priority: medium
- Automation candidate: No
- Automation reason: Visual distinctiveness and readability require human judgment; automated visual regression tools could supplement but not replace manual inspection for this criterion
- Preconditions:
  - User is authenticated and logged in
  - At least 5 products exist in the database
  - User is on the product listing page
- Steps:
  1. Navigate to the product listing page
  2. Wait for the page to fully load
  3. Visually inspect the list for clear separation between product items (borders, cards, spacing)
  4. Read the product name and description for each visible item
  5. Check that text is not truncated in a way that hides critical information
  6. Check that images (if any) are rendered and not broken
- Expected result: Each product item has a clear visual boundary from adjacent items. Text is readable and not overlapping. Product names and key information are fully visible or truncated with an affordance (e.g., ellipsis with tooltip).
- Acceptance criteria covered:
  - AC6

### PRJ_Story_1_TestCase_6 - Product list is displayed correctly on desktop viewport
- Type: functional
- Priority: high
- Automation candidate: Yes
- Automation reason: Playwright can set viewport size and assert layout elements are visible and properly positioned
- Preconditions:
  - User is authenticated and logged in
  - At least 3 products exist in the database
  - Browser is set to 1920x1080 or 1280x800 desktop viewport
- Steps:
  1. Open the browser at 1280x800 resolution
  2. Navigate to the product listing page
  3. Wait for the page to fully load
  4. Observe the layout of the product list
  5. Check that no horizontal scrollbar appears unnecessarily
  6. Check that product items are aligned and well-structured
- Expected result: Product list is rendered correctly in a desktop layout. All product items are visible and properly aligned. No layout overflow or broken styles are observed.
- Acceptance criteria covered:
  - AC7

### PRJ_Story_1_TestCase_7 - Product list is displayed correctly on mobile viewport
- Type: functional
- Priority: high
- Automation candidate: Yes
- Automation reason: Playwright can emulate mobile viewports and devices to verify responsive layout behavior
- Preconditions:
  - User is authenticated and logged in
  - At least 3 products exist in the database
  - Browser is set to a mobile viewport (e.g., 375x667 - iPhone SE)
- Steps:
  1. Open the browser or use developer tools to set viewport to 375x667
  2. Navigate to the product listing page
  3. Wait for the page to fully load
  4. Observe that the product list renders in a mobile-friendly layout
  5. Scroll through the list on mobile viewport
  6. Check that touch-friendly tap targets are appropriately sized
- Expected result: Product list is displayed in a responsive mobile layout. Products are stacked vertically and readable. No elements are clipped or overflowing off-screen. Scrolling works naturally.
- Acceptance criteria covered:
  - AC7

## Selected For Automation
- PRJ_Story_1_TestCase_1: Display product list with multiple products available
- PRJ_Story_1_TestCase_2: Product list loads within acceptable time threshold
- PRJ_Story_1_TestCase_3: Empty state displayed when no products are available
- PRJ_Story_1_TestCase_4: Product list is scrollable when items exceed viewport height
- PRJ_Story_1_TestCase_6: Product list is displayed correctly on desktop viewport
- PRJ_Story_1_TestCase_7: Product list is displayed correctly on mobile viewport
