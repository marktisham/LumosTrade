import time
from google.adk.agents import LlmAgent
from google.adk.tools import agent_tool
from google.adk.tools.google_search_tool import GoogleSearchTool
from google.adk.tools import url_context

# ============================================================================
# Retry Configuration
# ============================================================================
RETRY_MAX_ATTEMPTS = 3
RETRY_INITIAL_DELAY = 0.1
RETRY_MAX_DELAY = 10.0
RETRY_MULTIPLIER = 2.0

# ============================================================================
# Rate Limiting Callback
# ============================================================================
def rate_limit_callback(callback_context, llm_request):
    """
    Throttle requests to avoid hitting quota limits.
    """
    time.sleep(0.1)

def retry_on_error_callback(callback_context, llm_request, error=None, exception=None, **kwargs):
    """
    Handle model errors with exponential backoff retry logic.
    Uses callback_context.state to track retry attempts and delays.
    """
    # Use either error or exception parameter
    err = error or exception
    
    # Initialize retry tracking in state if not present
    request_id = id(llm_request)
    retry_key = f"retry_count_{request_id}"
    delay_key = f"retry_delay_{request_id}"
    
    if retry_key not in callback_context.state:
        callback_context.state[retry_key] = 0
        callback_context.state[delay_key] = RETRY_INITIAL_DELAY
    
    retry_count = callback_context.state[retry_key]
    current_delay = callback_context.state[delay_key]
    
    # Check if we've exceeded max attempts
    if retry_count >= RETRY_MAX_ATTEMPTS - 1:
        # Clean up state and let the error propagate
        del callback_context.state[retry_key]
        del callback_context.state[delay_key]
        return None  # Re-raise the exception
    
    # Increment retry count and calculate next delay
    callback_context.state[retry_key] = retry_count + 1
    
    # Sleep with exponential backoff
    time.sleep(current_delay)
    
    # Calculate next delay with exponential backoff, capped at max_delay
    next_delay = min(current_delay * RETRY_MULTIPLIER, RETRY_MAX_DELAY)
    callback_context.state[delay_key] = next_delay
    
    # Return None to retry the request
    return None

my_agent_google_search_agent = LlmAgent(
    name='LumosChat_google_search_agent',
    model='gemini-2.5-flash',
    description=(
        'Agent specialized in performing Google searches.'
    ),
    sub_agents=[],
    instruction='Use the GoogleSearchTool to find information on the web. Also use this to find current or relative date and time values if needed. Assume user is in US Eastern/New York time.',
    tools=[
        GoogleSearchTool()
    ],
    before_model_callback=[rate_limit_callback],
    on_model_error_callback=[retry_on_error_callback],
)

my_agent_url_context_agent = LlmAgent(
    name='LumosChat_url_context_agent',
    model='gemini-2.5-flash',
    description=(
        'Agent specialized in fetching content from URLs.'
    ),
    sub_agents=[],
    instruction='Use the UrlContextTool to retrieve content from provided URLs.',
    tools=[
        url_context
    ],
    before_model_callback=[rate_limit_callback],
    on_model_error_callback=[retry_on_error_callback],
)


google_search_agent_tool = agent_tool.AgentTool(agent=my_agent_google_search_agent)
url_context_agent_tool = agent_tool.AgentTool(agent=my_agent_url_context_agent)
