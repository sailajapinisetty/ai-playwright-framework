# Manual Test Cases - Story 5 (UI input)

Story title: Search for a Speaker and View Details

## Story Acceptance Criteria
- User can search for a speaker by name using a search input field
- Search results display matching speakers based on the entered query
- User can click on a speaker from the search results to view their detailed profile
- Speaker detail page displays relevant information such as name, bio, topics, and contact details
- If no speakers match the search query, a 'No results found' message is displayed

## Manual Test Cases

### TC-001 - Search for an existing speaker by name and view their full profile details
- Type: functional
- Priority: high
- Automation candidate: Yes
- Automation reason: This happy-path flow involves stable UI interactions (typing into an input, verifying list results, clicking a result, and asserting text on a detail page) that are straightforward to implement and reliably verify using Playwright selectors and assertions.
- Preconditions:
  - User is on the speakers search page
  - At least one speaker record exists in the system (e.g., speaker named 'Jane Doe')
  - The application is accessible and fully loaded
  - User is authenticated if authentication is required
- Steps:
  1. Locate the search input field on the speakers search page
  2. Type 'Jane Doe' into the search input field
  3. Observe the search results area for matching speakers
  4. Verify that a result card or list item for 'Jane Doe' appears in the results
  5. Click on the 'Jane Doe' result to navigate to her speaker detail page
  6. Observe the speaker detail page that loads
  7. Verify the speaker's full name 'Jane Doe' is displayed prominently on the detail page
  8. Verify the speaker's biography or description text is visible on the page
  9. Verify the speaker's topics or areas of expertise are listed on the page
  10. Verify the speaker's contact details or social links are present on the page
- Expected result: After typing 'Jane Doe' in the search field, at least one matching result is displayed. Upon clicking the result, the speaker detail page loads and correctly displays the speaker's name, biography, topics, and contact information corresponding to 'Jane Doe'.
- Acceptance criteria covered:
  - User can search for a speaker by name using a search input field
  - Search results display matching speakers based on the entered query
  - User can click on a speaker from the search results to view their detailed profile
  - Speaker detail page displays relevant information such as name, bio, topics, and contact details

## Selected For Automation
- TC-001: Search for an existing speaker by name and view their full profile details
