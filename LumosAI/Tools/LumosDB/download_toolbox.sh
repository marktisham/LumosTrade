rm -f ./toolbox

# Needed for Mac M1/M2
# Download directly into the parent directory
curl -L -o ./toolbox https://storage.googleapis.com/genai-toolbox/v0.24.0/darwin/arm64/toolbox
chmod +x ./toolbox

