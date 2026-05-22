# Manual Test Cases - Story 2 (UI input)

Story title: Search for a Speaker and View Details

## Story Acceptance Criteria
- User can access a search interface to look up speakers
- User can enter a speaker name or keyword in the search field
- System returns a list of matching speakers based on the search query
- User can select a speaker from the search results
- User can view detailed information about the selected speaker (e.g., name, bio, topics, contact)

## Manual Test Cases

### TC-001 - Search for a speaker by name and view their full details
- Type: functional
- Priority: high
- Automation candidate: Yes
- Automation reason: This happy path flow involves stable UI interactions (text input, button click, list selection, page navigation) that are reliably automatable with Playwright using locators for the search field, results list, and detail page elements.
- Preconditions:
  - User is logged into the application or the speakers directory is publicly accessible
  - At least one speaker profile exists in the system (e.g., speaker named 'Jane Doe')
  - The search feature is visible and enabled on the speakers page
- Steps:
  1. Navigate to the Speakers section of the application
  2. Locate the search input field on the page
  3. Type 'Jane Doe' into the search input field
  4. Press Enter or click the Search button to submit the query
  5. Observe the list of search results returned on the page
  6. Verify that 'Jane Doe' appears in the search results list
  7. Click on 'Jane Doe' from the search results
  8. Observe the speaker detail page that loads
- Expected result: The search returns at least one result matching 'Jane Doe'. Upon clicking the result, the speaker detail page displays the speaker's full name, biography, areas of expertise or topics, and any available contact or profile information without errors.
- Acceptance criteria covered:
  - User can enter a speaker name or keyword in the search field
  - System returns a list of matching speakers based on the search query
  - User can select a speaker from the search results
  - User can view detailed information about the selected speaker (e.g., name, bio, topics, contact)

## Selected For Automation
- TC-001: Search for a speaker by name and view their full details
