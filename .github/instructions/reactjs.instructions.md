---
description: 'ReactJS development standards and best practices for Kino project'
applyTo: '**/*.jsx, **/*.tsx, **/*.js, **/*.ts, **/*.css, **/*.scss'
---

# ReactJS Development Instructions for Kino Project

Instructions for building ReactJS applications in the Kino project using Next.js 14 with App Router, Redux Toolkit, and Material UI.

## Project Context
- Next.js 14 with App Router
- Redux Toolkit for state management
- Material UI v5 for UI components
- JavaScript (not TypeScript)
- Functional components with hooks as default
- Fetch API for data fetching with Redux integration

## Development Standards

### Architecture
- Use functional components with hooks as the primary pattern
- Implement component composition over inheritance
- Organize components by feature in the app directory structure
- Separate presentational and container components clearly
- Use Redux Toolkit slices for global state management
- Implement proper component hierarchies with clear data flow

### Component Design
- Follow the single responsibility principle for components
- Use descriptive and consistent naming conventions (PascalCase for components)
- Implement proper prop validation with PropTypes (since not using TypeScript)
- Design components to be testable and reusable
- Keep components small and focused on a single concern
- Use Material UI components for consistent UI

### State Management
- Use Redux Toolkit with react-redux hooks for global state
- Use `useState` for local component state
- Implement `useReducer` for complex local state logic
- Leverage `useSelector` and `useDispatch` hooks for Redux integration
- Implement proper state normalization in Redux slices
- Use createAsyncThunk for API calls with proper request deduplication

### Hooks and Effects
- Use `useEffect` with proper dependency arrays to avoid infinite loops
- Implement cleanup functions in effects to prevent memory leaks
- Use `useMemo` and `useCallback` for performance optimization when needed
- Create custom hooks for reusable stateful logic
- Follow the rules of hooks (only call at the top level)
- Use `useRef` for accessing DOM elements and storing mutable values

### Redux Toolkit Patterns
- Use createSlice for defining reducers and actions
- Use createAsyncThunk for API calls
- Implement proper loading, error, and success states
- Handle request deduplication using requestId pattern
- Use proper action creators and reducers
- Normalize state structure in Redux store

### Material UI Integration
- Use Material UI components for consistent UI
- Follow Material Design principles
- Use MUI theme customization when needed
- Implement responsive design with MUI Grid and Breakpoints
- Use MUI Icons for consistent iconography
- Follow MUI accessibility guidelines

### Data Fetching
- Use fetch API with Redux Toolkit integration
- Implement proper loading, error, and success states
- Handle API errors and display user-friendly messages
- Use environment variables for API endpoints (API_HOST_URL)
- Implement request deduplication for performance
- Handle pagination and infinite scrolling appropriately

### Error Handling
- Implement centralized error handling through Redux
- Use proper error states in data fetching
- Implement fallback UI for error scenarios
- Display user-friendly error messages
- Handle async errors in effects and event handlers

### Routing
- Use Next.js App Router conventions
- Implement dynamic routes with proper parameter handling
- Use Link component for client-side navigation
- Implement proper route protection where needed
- Handle route parameters and query strings properly

### Styling
- Use Material UI's styled components or sx prop
- Implement responsive design with mobile-first approach
- Use MUI theme for consistent spacing, typography, and colors
- Ensure accessibility with proper ARIA attributes and semantic HTML
- Follow Material Design color and typography systems

### Performance Optimization
- Use React.memo for component memoization when appropriate
- Implement code splitting with Next.js dynamic imports
- Optimize bundle size by importing only needed MUI components
- Use useMemo and useCallback judiciously to prevent unnecessary re-renders
- Implement proper pagination for large datasets
- Profile components with React DevTools to identify performance bottlenecks

### Testing
- Write unit tests for components using React Testing Library
- Test Redux slice logic and async thunks
- Test component behavior, not implementation details
- Mock API calls and Redux store appropriately
- Implement integration tests for complex component interactions
- Test accessibility features and keyboard navigation

### Accessibility
- Use semantic HTML elements appropriately
- Implement proper ARIA attributes and roles
- Ensure keyboard navigation works for all interactive elements
- Provide alt text for images and descriptive text for icons
- Implement proper color contrast ratios
- Test with screen readers and accessibility tools

## Implementation Process
1. Plan component architecture and data flow
2. Set up project structure following Next.js App Router conventions
3. Create Redux slice for state management
4. Implement core components with Material UI
5. Add state management and data fetching logic
6. Implement routing and navigation
7. Implement error handling and loading states
8. Add testing coverage for components and functionality
9. Optimize performance and bundle size
10. Ensure accessibility compliance
11. Add documentation and code comments

## Additional Guidelines
- Follow React's naming conventions (PascalCase for components, camelCase for functions)
- Use meaningful commit messages and maintain clean git history
- Document complex components and Redux slices
- Keep dependencies up to date and audit for security vulnerabilities
- Use environment variables for configuration
- Follow the project's "just enough" philosophy - implement only required features

## Common Patterns Used in Kino
- Redux slices with async thunks for API calls
- Request deduplication pattern using requestId
- Centralized error handling through Redux
- Material UI component composition
- Next.js App Router page structure
- Environment-based API endpoint configuration

## Example Patterns

Example pattern from `titles/slice.js`:
```javascript
export const fetchTitles = createAsyncThunk(
  'titles/fetchTitles',
  async (_, { getState, requestId, dispatch }) => {
    // Implementation with request deduplication and error handling
  }
);
```