#!/usr/bin/env bash

# Color definitions
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
RED='\033[0;31m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m' # No Color

# Fancy header
echo ""
echo -e "${BOLD}Cursor Agent Installer${NC}"
echo ""

# Function to print steps with style
print_step() {
    echo -e "${BLUE}▸${NC} ${1}"
}

# Function to print success
print_success() {
    # Move cursor up one line and clear it
    echo -ne "\033[1A\033[2K"
    echo -e "${GREEN}✓${NC} ${1}"
}

# Function to print error
print_error() {
    echo -e "${RED}✗${NC} ${1}"
}

# Detect OS and Architecture
print_step "Detecting system architecture..."

# Detect OS
OS="$(uname -s)"
case "${OS}" in
    Linux*)     OS="linux";;
    Darwin*)    OS="darwin";;
    *)
        print_error "Unsupported operating system: ${OS}"
        exit 1
        ;;
esac

# Detect Architecture
ARCH="$(uname -m)"
case "${ARCH}" in
    x86_64|amd64)  ARCH="x64";;
    arm64|aarch64) ARCH="arm64";;
    *)
        print_error "Unsupported architecture: ${ARCH}"
        exit 1
        ;;
esac

print_success "Detected ${OS}/${ARCH}"

# Installation steps
print_step "Creating installation directory..."
# Create temporary directory for atomic download inside versions folder
TEMP_EXTRACT_DIR="$HOME/.local/share/cursor-agent/versions/.tmp-2025.09.12-4852336-$(date +%s)"
mkdir -p "${TEMP_EXTRACT_DIR}"

print_success "Directory created"


print_step "Downloading Cursor Agent package..."
DOWNLOAD_URL="https://downloads.cursor.com/lab/2025.09.12-4852336/${OS}/${ARCH}/agent-cli-package.tar.gz"
echo -e "${DIM}  Download URL: ${DOWNLOAD_URL}${NC}"

# Cleanup function
cleanup() {
    rm -rf "${TEMP_EXTRACT_DIR}"
}
trap cleanup EXIT

# Download with progress bar and better error handling
if curl -fSL --progress-bar "${DOWNLOAD_URL}" \
  | tar --strip-components=1 -xzf - -C "${TEMP_EXTRACT_DIR}"; then
  echo -ne "\033[1A\033[2K"
  echo -ne "\033[1A\033[2K"
  echo -ne "\033[1A\033[2K"
  print_success "Package downloaded and extracted"
else
    print_error "Download failed. Please check your internet connection and try again."
    print_error "If the problem persists, the package might not be available for ${OS}/${ARCH}."
    cleanup
    exit 1
fi

print_step "Finalizing installation..."
# Atomically move from temp to final destination
FINAL_DIR="$HOME/.local/share/cursor-agent/versions/2025.09.12-4852336"
rm -rf "${FINAL_DIR}"
if mv "${TEMP_EXTRACT_DIR}" "${FINAL_DIR}"; then
  print_success "Package installed successfully"
else
    print_error "Failed to install package. Please check permissions."
    cleanup
    exit 1
fi


print_step "Creating bin directory..."
mkdir -p ~/.local/bin
print_success "Bin directory ready"


print_step "Creating symlink to cursor-agent executable..."
# Remove any existing symlink or file
rm -f ~/.local/bin/cursor-agent
# Create symlink to the cursor-agent executable
ln -s ~/.local/share/cursor-agent/versions/2025.09.12-4852336/cursor-agent ~/.local/bin/cursor-agent
print_success "Symlink created"

# Success message
echo ""
echo -e "${BOLD}${GREEN}✨ Installation Complete! ${NC}"
echo ""
echo ""

# Determine configured shells
CURRENT_SHELL="$(basename $SHELL)"
SHOW_BASH=false
SHOW_ZSH=false
SHOW_FISH=false

case "${CURRENT_SHELL}" in
  bash) SHOW_BASH=true ;;
  zsh) SHOW_ZSH=true ;;
  fish) SHOW_FISH=true ;;
esac

# Also consider presence of config files as configured
if [ -f "$HOME/.bashrc" ] || [ -f "$HOME/.bash_profile" ]; then SHOW_BASH=true; fi
if [ -f "$HOME/.zshrc" ]; then SHOW_ZSH=true; fi
if [ -f "$HOME/.config/fish/config.fish" ]; then SHOW_FISH=true; fi

# Next steps with style
echo -e "${BOLD}Next Steps${NC}"
echo ""
echo -e "${BOLD}1.${NC} Add ~/.local/bin to your PATH:"

if [ "${SHOW_BASH}" = true ]; then
  echo -e "   ${DIM}For bash:${NC}"
  echo -e "   ${BOLD}${BLUE}echo 'export PATH=\"\$HOME/.local/bin:\$PATH\"' >> ~/.bashrc${NC}"
  echo -e "   ${BOLD}${BLUE}source ~/.bashrc${NC}"
  echo ""
fi

if [ "${SHOW_ZSH}" = true ]; then
  echo -e "   ${DIM}For zsh:${NC}"
  echo -e "   ${BOLD}${BLUE}echo 'export PATH=\"\$HOME/.local/bin:\$PATH\"' >> ~/.zshrc${NC}"
  echo -e "   ${BOLD}${BLUE}source ~/.zshrc${NC}"
  echo ""
fi

if [ "${SHOW_FISH}" = true ]; then
  echo -e "   ${DIM}For fish:${NC}"
  echo -e "   ${BOLD}${BLUE}mkdir -p \$HOME/.config/fish${NC}"
  echo -e "   ${BOLD}${BLUE}echo 'fish_add_path \$HOME/.local/bin' >> \$HOME/.config/fish/config.fish${NC}"
  echo -e "   ${BOLD}${BLUE}source \$HOME/.config/fish/config.fish${NC}"
  echo ""
fi

# Fallback if no known shells detected/configured
if [ "${SHOW_BASH}" != true ] && [ "${SHOW_ZSH}" != true ] && [ "${SHOW_FISH}" != true ]; then
  echo -e "   ${DIM}Add to PATH manually:${NC}"
  echo -e "   ${BOLD}${BLUE}export PATH=\"\$HOME/.local/bin:\$PATH\"${NC}"
  echo ""
fi

echo -e "${BOLD}2.${NC} Start using Cursor Agent:"
echo -e "   ${BOLD}cursor-agent${NC}"
echo ""
echo ""
echo -e "${BOLD}${CYAN}Happy coding! 🚀${NC}"
echo ""