import { datadogRum } from '@datadog/browser-rum'
import { createDatadogLink } from '@datadog/browser-rum-graphql'
import { ApolloClient, InMemoryCache, createHttpLink, from, gql } from '@apollo/client'

// Initialize RUM (no plugin needed - enrichment happens automatically via headers)
datadogRum.init({
  applicationId: 'xxx',
  clientToken: 'xxx',
  site: 'datad0g.com',
  service: 'xxx',
  trackResources: true,
  sessionReplaySampleRate: 100,
  trackLongTasks: true,
})

// Create Apollo Client with Datadog Link
const httpLink = createHttpLink({
  uri: 'https://countries.trevorblades.com/graphql',
})

const client = new ApolloClient({
  link: from([createDatadogLink(), httpLink]),
  cache: new InMemoryCache(),
})

const GET_COUNTRIES = gql`
  query GetCountries($filter: CountryFilterInput) {
    countries(filter: $filter) {
      code
      name
      emoji
      capital
    }
  }
`

const GET_COUNTRY_BY_CODE = gql`
  query GetCountryByCode($code: ID!) {
    country(code: $code) {
      code
      name
      emoji
      capital
      currency
      languages {
        code
        name
      }
    }
  }
`

const SEARCH_COUNTRIES = gql`
  query SearchCountries {
    countries {
      code
      name
      emoji
    }
  }
`

async function loadCountries() {
  try {
    const result = await client.query({
      query: GET_COUNTRIES,
      variables: {
        filter: {
          continent: {
            eq: 'EU',
          },
        },
      },
    })

    displayResults('Countries in Europe', result.data.countries.slice(0, 5))
  } catch (error) {
    console.error(error)
  }
}

async function loadCountryDetails() {
  try {
    const result = await client.query({
      query: GET_COUNTRY_BY_CODE,
      variables: {
        code: 'FR',
      },
    })

    displayResults('France Details', [result.data.country])
  } catch (error) {}
}

async function searchCountries() {
  try {
    const result = await client.query({
      query: SEARCH_COUNTRIES,
    })

    displayResults('All Countries', result.data.countries.slice(0, 10))
  } catch (error) {
    console.error(error)
  }
}

function displayResults(title, data) {
  const resultsDiv = document.getElementById('results')
  resultsDiv.innerHTML = `
    <h3>✅ ${title}</h3>
    <pre>${JSON.stringify(data, null, 2)}</pre>
  `
}
function initUI() {
  document.body.innerHTML = `
    <div style="max-width: 800px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif;">
      <h1>🚀 RUM GraphQL Integration Test</h1>
      <p>This sandbox uses <strong>real Apollo Client</strong> with <code>@datadog/browser-rum-graphql</code></p>
      
      <div style="margin: 20px 0;">
        <button onclick="loadCountries()" style="margin: 5px; padding: 10px 20px; background: #007cba; color: white; border: none; border-radius: 4px; cursor: pointer;">
          Query: Load EU Countries
        </button>
        
        <button onclick="loadCountryDetails()" style="margin: 5px; padding: 10px 20px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer;">
          Query: Load France Details
        </button>
        
        <button onclick="searchCountries()" style="margin: 5px; padding: 10px 20px; background: #ffc107; color: black; border: none; border-radius: 4px; cursor: pointer;">
          Query: Search All Countries
        </button>
      </div>
      
      <div id="results" style="background: #f8f9fa; padding: 20px; border-radius: 4px; margin-top: 20px;">
        <p>Click a button to test GraphQL integration</p>
      </div>
      
      <div style="margin-top: 30px; padding: 20px; background: #e7f3ff; border-radius: 4px;">
        <h3>💡 What's happening:</h3>
        <ol>
          <li><strong>createDatadogLink()</strong> automatically adds <code>_dd-graphql-*</code> headers</li>
          <li><strong>RUM Core SDK</strong> intercepts these headers from network requests</li>
          <li><strong>RUM Events</strong> are enriched with <code>resource.graphql</code> data</li>
        </ol>
        <p>Open DevTools → Network → Check GraphQL requests for custom headers!</p>
        <p>Open Datadog RUM → Resources → Look for <code>resource.graphql</code> fields!</p>
      </div>
    </div>
  `

  window.loadCountries = loadCountries
  window.loadCountryDetails = loadCountryDetails
  window.searchCountries = searchCountries
}

initUI()
