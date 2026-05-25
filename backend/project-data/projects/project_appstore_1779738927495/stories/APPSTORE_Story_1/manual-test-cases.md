# Manual Test Cases - Story 1 (UI input)

Story title: Display Product List on Landing Page

## Story Acceptance Criteria
- AC1: The landing page must display a list of available products
- AC2: Each product in the list must show at minimum a product name
- AC3: The product list must be visible without requiring login or additional navigation
- AC4: The landing page must load and render the product list within an acceptable time
- AC5: If no products are available, the page must display an appropriate empty state message
- AC6: The product list must be accessible and readable on different screen sizes
- AC7: Each product entry should display relevant product information (e.g., name, image, price)

## Manual Test Cases

### APPSTORE_Story_1_TestCase_1 - Verify product list is displayed on landing page for a guest user
- Type: functional
- Priority: high
- Automation candidate: Yes
- Automation reason: Stable UI element presence check; easily verifiable with Playwright by asserting product list container is visible and contains at least one item
- Preconditions:
  - Application is deployed and accessible
  - At least one product exists in the database/backend
  - User is not logged in (guest state)
  - Browser cache is cleared
- Steps:
  1. Open a supported web browser
  2. Navigate to the application landing page URL
  3. Wait for the page to fully load
  4. Observe the main content area of the landing page
  5. Verify that a list or grid of products is present on the page
- Expected result: The landing page displays a visible list or grid of products without requiring any login or additional navigation steps
- Acceptance criteria covered:
  - AC1
  - AC3

### APPSTORE_Story_1_TestCase_2 - Verify each product displays a product name in the list
- Type: functional
- Priority: high
- Automation candidate: Yes
- Automation reason: Text content assertions per product card can be reliably done in Playwright by iterating over product list items and checking innerText
- Preconditions:
  - Application is deployed and accessible
  - Multiple products exist in the database/backend with valid names
  - User navigates to the landing page
- Steps:
  1. Open a supported web browser
  2. Navigate to the application landing page URL
  3. Wait for the page to fully load
  4. Inspect each product card or list item in the product list
  5. Verify that every product entry displays a non-empty product name
  6. Confirm that product names are readable and not truncated unexpectedly
- Expected result: Every product displayed in the list contains a visible, non-empty product name that is legible to the user
- Acceptance criteria covered:
  - AC2
  - AC7

### APPSTORE_Story_1_TestCase_3 - Verify each product displays an image on the landing page
- Type: functional
- Priority: high
- Automation candidate: Yes
- Automation reason: Playwright can evaluate image naturalWidth > 0 and src attribute presence to confirm images are loaded correctly
- Preconditions:
  - Application is deployed and accessible
  - Products in the backend have associated images
  - User navigates to the landing page
- Steps:
  1. Open a supported web browser
  2. Navigate to the application landing page URL
  3. Wait for the page to fully load
  4. Inspect each product card or list item
  5. Verify that each product displays an image element
  6. Confirm that the image is loaded and not broken (no broken image icon)
- Expected result: Every product in the list displays a loaded, non-broken product image
- Acceptance criteria covered:
  - AC7

### APPSTORE_Story_1_TestCase_4 - Verify each product displays a price on the landing page
- Type: functional
- Priority: high
- Automation candidate: Yes
- Automation reason: Playwright can use regex or text assertions to verify price format per product card
- Preconditions:
  - Application is deployed and accessible
  - Products in the backend have associated prices
  - User navigates to the landing page
- Steps:
  1. Open a supported web browser
  2. Navigate to the application landing page URL
  3. Wait for the page to fully load
  4. Inspect each product card or list item
  5. Verify that each product entry displays a price value
  6. Confirm that the price format is correct (e.g., currency symbol, decimal format)
- Expected result: Every product in the list displays a correctly formatted price value
- Acceptance criteria covered:
  - AC7

### APPSTORE_Story_1_TestCase_5 - Verify landing page loads product list within acceptable response time
- Type: functional
- Priority: high
- Automation candidate: Yes
- Automation reason: Playwright supports performance timing APIs and can measure time-to-visible for specific elements
- Preconditions:
  - Application is deployed and accessible
  - Products exist in the backend
  - Network conditions are normal (no throttling)
  - Browser cache is cleared
- Steps:
  1. Open browser developer tools and navigate to the Network tab
  2. Navigate to the application landing page URL
  3. Start a performance timer or note the navigation start time
  4. Wait for the product list to fully render on the page
  5. Record the total page load time
  6. Verify the product list is visible within 3 seconds of navigation
- Expected result: The product list is rendered and visible on the landing page within 3 seconds of page load under normal network conditions
- Acceptance criteria covered:
  - AC4

### APPSTORE_Story_1_TestCase_6 - Verify empty state message is shown when no products are available
- Type: edge
- Priority: high
- Automation candidate: Yes
- Automation reason: Playwright can assert visibility of empty state element when mock API returns an empty product array
- Preconditions:
  - Application is deployed and accessible
  - All products have been removed from the database or product catalog is empty
  - User navigates to the landing page
- Steps:
  1. Ensure the product catalog/database is empty (coordinate with backend team or use test environment)
  2. Open a supported web browser
  3. Navigate to the application landing page URL
  4. Wait for the page to fully load
  5. Observe the main content area where the product list would normally appear
  6. Verify that a meaningful empty state message is displayed
- Expected result: The landing page displays an appropriate empty state message (e.g., 'No products available' or 'Coming soon') instead of a blank area or error when no products exist
- Acceptance criteria covered:
  - AC5

### APPSTORE_Story_1_TestCase_7 - Verify product list is displayed correctly on desktop screen size
- Type: functional
- Priority: high
- Automation candidate: Yes
- Automation reason: Playwright supports viewport configuration and visual assertions for layout verification at specific resolutions
- Preconditions:
  - Application is deployed and accessible
  - Products exist in the backend
  - Desktop browser window at 1920x1080 resolution
- Steps:
  1. Open a supported browser and set the window size to 1920x1080
  2. Navigate to the application landing page URL
  3. Wait for the page to fully load
  4. Verify that the product list is displayed in the main content area
  5. Confirm that products are arranged in a proper grid or list layout
  6. Ensure no products are cut off or overlapping
  7. Verify that product names, images, and prices are clearly visible
- Expected result: The product list renders correctly on a 1920x1080 desktop viewport with proper layout, no overlapping elements, and all product information clearly visible
- Acceptance criteria covered:
  - AC1
  - AC6

### APPSTORE_Story_1_TestCase_8 - Verify product list is displayed correctly on tablet screen size
- Type: functional
- Priority: high
- Automation candidate: Yes
- Automation reason: Playwright can emulate tablet viewports and run the same product list assertions at different screen sizes
- Preconditions:
  - Application is deployed and accessible
  - Products exist in the backend
  - Browser window or device at tablet resolution (768x1024)
- Steps:
  1. Open a supported browser and set the window size to 768x1024 (or use browser responsive mode)
  2. Navigate to the application landing page URL
  3. Wait for the page to fully load
  4. Verify that the product list is displayed in the main content area
  5. Confirm the layout adapts appropriately to the tablet viewport
  6. Ensure all product information is readable and not overflowing
  7. Scroll through the product list to verify all items are accessible
- Expected result: The product list renders correctly on a 768x1024 tablet viewport with responsive layout, all product information readable, and no content overflow
- Acceptance criteria covered:
  - AC6

## Selected For Automation
- APPSTORE_Story_1_TestCase_1: Verify product list is displayed on landing page for a guest user
- APPSTORE_Story_1_TestCase_2: Verify each product displays a product name in the list
- APPSTORE_Story_1_TestCase_3: Verify each product displays an image on the landing page
- APPSTORE_Story_1_TestCase_4: Verify each product displays a price on the landing page
- APPSTORE_Story_1_TestCase_5: Verify landing page loads product list within acceptable response time
- APPSTORE_Story_1_TestCase_6: Verify empty state message is shown when no products are available
- APPSTORE_Story_1_TestCase_7: Verify product list is displayed correctly on desktop screen size
- APPSTORE_Story_1_TestCase_8: Verify product list is displayed correctly on tablet screen size
