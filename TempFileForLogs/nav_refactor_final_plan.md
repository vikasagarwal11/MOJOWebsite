# 🚀 Navigation Architecture Refactoring - FINAL Implementation Plan

## 📋 **Table of Contents**
1. [Session Management Impact Analysis](#session-management-impact-analysis)
2. [Implementation Phases](#implementation-phases)
3. [Session-Specific Fixes](#session-specific-fixes)
4. [Backup Strategy](#backup-strategy)
5. [Verification Checklist](#verification-checklist)
6. [Error Handling Strategy](#error-handling-strategy)
7. [Rollback Plan](#rollback-plan)

---

## 🔍 **Session Management Impact Analysis**

### **Will This Resolve Session Issues? YES - Here's How:**

#### **Current Session Problems:**

| Problem | Root Cause | This Refactor Fixes? |
|---------|------------|---------------------|
| **1. Multiple restore_session() calls** | Called in 15+ places | ✅ **YES** - Phase 1.1 |
| **2. Race conditions** | Concurrent session restores | ✅ **YES** - Phase 1.1 |
| **3. Session reset nukes nav keys** | Incomplete preserve list | ✅ **YES** - Phase 1.3 |
| **4. Logout doesn't work on some pages** | Missing nav_action handlers | ✅ **YES** - Phase 1.2 |
| **5. Session state inconsistency** | No single init point | ✅ **YES** - Phase 1.1 |
| **6. Workspace lost after reset** | Not in preserve list | ✅ **YES** - Phase 1.3 |
| **7. Processing mode lost after reset** | Not in preserve list | ✅ **YES** - Phase 1.3 |
| **8. Hybrid engine lost after reset** | Not in preserve list | ✅ **YES** - Phase 1.3 |
| **9. Auth state sometimes lost** | Timing issues with restore | ✅ **YES** - Phase 1.1 |
| **10. Page navigation clears session** | No navigation key preservation | ✅ **YES** - Phase 1.3 |

### **Additional Session Benefits:**

✅ **Predictable Session Lifecycle:**
- Clear initialization point (once per page load)
- Deterministic order of operations
- No race conditions

✅ **Safer Session Reset:**
- Preserves 15+ critical keys (auth + nav + engine)
- Won't break user's workflow
- Clear separation: data/filters vs. state

✅ **Better Error Recovery:**
- Centralized error handling in nav_handler.py
- Graceful degradation if session restore fails
- Fallback to safe defaults

---

## 📅 **Implementation Phases** (REVISED)

### **Phase 0: Preparation & Analysis** 
**Duration:** 1 day  
**Risk:** None (no code changes)

#### **Objectives:**
- Create safety net before any changes
- Document current state
- Test backup/restore procedures
- Make critical upfront decisions

#### **Tasks:**

**0.1 Create Backup Infrastructure**
```bash
mkdir -p backups/navigation_refactor/phase0
mkdir -p backups/navigation_refactor/phase1
mkdir -p backups/navigation_refactor/phase2
mkdir -p backups/navigation_refactor/phase3
mkdir -p backups/navigation_refactor/phase4
mkdir -p archived/unused_navigation
```

**0.2 Backup All Files (Pre-Change State)**
```bash
# Core navigation files
cp src/ui/top_nav.py backups/navigation_refactor/phase0/
cp src/ui/sidebar.py backups/navigation_refactor/phase0/
cp src/ui/layout/routes.py backups/navigation_refactor/phase0/
cp src/app_helpers.py backups/navigation_refactor/phase0/
cp app.py backups/navigation_refactor/phase0/

# All page files
cp pages/*.py backups/navigation_refactor/phase0/

# Files to be archived
cp src/ui/layout/topnav.py backups/navigation_refactor/phase0/
cp src/ui/layout/sidebar.py backups/navigation_refactor/phase0/
cp src/ui/components/navigation.py backups/navigation_refactor/phase0/
cp src/ui/sidebar_enhanced.py backups/navigation_refactor/phase0/
cp src/ui/sidebar_final.py backups/navigation_refactor/phase0/
```

**0.3 Document Current State**

Create `backups/navigation_refactor/CURRENT_STATE.md`:
```markdown
# Pre-Refactor State Documentation

## Files Modified: 21
## Files Archived: 5
## Total LOC Affected: ~3,500

## Current Session Flow:
1. app.py calls restore_session() (line 40)
2. initialize_session() calls restore_session() (line 32)
3. render_top_nav() calls restore_session() (line 20)
4. Each page file calls restore_session() (12+ pages)

**Total restore_session() calls per page load:** ~15+

## Current Navigation Flow:
1. Top nav renders HTML/JS (lines 91-490 in top_nav.py)
2. JavaScript sets nav_action via postMessage
3. Page files check for nav_action in session state
4. Page files manually route based on nav_action
5. Some pages missing nav_action handlers (Billing, Settings, API Keys, System Diagnostics)

## Current Session Reset:
- Preserves: 7 auth keys only
- Loses: workspace, processing_mode, nav_action, hybrid_master_engine
```

**0.4 Test Backup Restoration**
```bash
# Test that we can restore from backup
cp backups/navigation_refactor/phase0/top_nav.py src/ui/top_nav.py
# Verify app still works
# Then revert for real implementation
```

**0.5 Make Critical Decisions**

Document in `backups/navigation_refactor/DECISIONS.md`:
```markdown
# Implementation Decisions

## Auto-Sidebar Strategy:
**Decision:** Use CSS hide in Phase 1, switch to config in Phase 2
**Rationale:** CSS is quick and reversible; config is more robust long-term

## Auth Posture:
**Decision:** Social AE public (requires_auth=False), all others gated
**Rationale:** Social AE is marketing/demo feature; others handle sensitive data

## Session Restore Location:
**Decision:** Single call in initialize_session() only
**Rationale:** Predictable lifecycle, no race conditions

## Navigation Action Handling:
**Decision:** Centralized in nav_handler.py, called from render_top_nav()
**Rationale:** Single source of truth, consistent behavior

## Phase 2/3 Split:
**Decision:** Keep HTML/JS in Phase 2, remove in Phase 3
**Rationale:** Separate "reading from routes.py" from "rendering method change"
```

#### **Verification Checklist:**
- [ ] All backups created
- [ ] Backup restoration tested
- [ ] Current state documented
- [ ] Decisions documented
- [ ] Team reviewed decisions

---

### **Phase 1: Session & Navigation Stability**
**Duration:** 4-5 days  
**Risk:** Low (no UX changes, only internal refactoring)

#### **Objectives:**
- Fix session management issues
- Centralize navigation handling
- No visible UX changes

---

#### **Phase 1.1: Centralize Session Restoration** ⚠️ **CRITICAL**
**Duration:** 1-2 days

**Problem:** 15+ `restore_session()` calls create race conditions and unpredictable behavior

**Solution:** Single restoration point with guard

**Files to Create:**
None (modify existing)

**Files to Modify:**

**1. Add Session Guard to `src/auth/auth.py`:**
```python
# At module level
_session_restored_flag = False

def restore_session():
    """
    Restore user session from Supabase (with guard to prevent multiple calls).
    Call this ONCE per page load in initialize_session().
    """
    global _session_restored_flag
    
    # Guard: Only restore once per request
    if _session_restored_flag:
        return
    
    try:
        # Existing restoration logic...
        # ...
        
        # Mark as restored
        _session_restored_flag = True
        
    except Exception as e:
        # Log but don't crash
        st.error(f"Session restore failed: {e}")
        _session_restored_flag = True  # Don't retry

def _reset_session_guard():
    """Reset the session guard (called at start of each request)."""
    global _session_restored_flag
    _session_restored_flag = False
```

**2. Keep Single Call in `src/app_helpers.py`:**
```python
def initialize_session():
    """Initialize session state with default values and restore auth."""
    
    # ONLY PLACE that calls restore_session
    try:
        from src.auth.auth import restore_session
        restore_session()
    except Exception as e:
        # Graceful fallback
        pass
    
    # Rest of initialization...
```

**3. Reset Guard in `app.py` (at very top):**
```python
"""AetherSignal – Landing Page"""

# Load environment variables from .env file (must be first!)
from dotenv import load_dotenv
load_dotenv()

# Reset session restoration guard for new request
try:
    from src.auth.auth import _reset_session_guard
    _reset_session_guard()
except Exception:
    pass

# Rest of imports...
```

**4. Remove from `src/ui/top_nav.py`:**
```python
# Line 20 - DELETE THIS BLOCK:
# try:
#     from src.auth.auth import restore_session
#     restore_session()
# except Exception:
#     pass
```

**5. Remove from ALL page files:**

Files to update:
- `pages/1_Quantum_PV_Explorer.py` (lines 14-22)
- `pages/2_Social_AE_Explorer.py` (lines 8-13)
- `pages/3_AE_Explorer.py`
- `pages/Billing.py` (lines 10-14)
- `pages/Profile.py`
- `pages/Login.py`
- `pages/Register.py`
- `pages/Settings.py`
- `pages/API_Keys.py`
- `pages/System_Diagnostics.py`
- `pages/Onboarding.py`
- `pages/Demo_Home.py`
- `pages/Demo_Landing.py`
- `pages/98_🔐_Data_Source_Manager.py`
- `pages/Admin_Data_Sources.py`

Remove this pattern:
```python
# DELETE THESE LINES:
try:
    from src.auth.auth import restore_session
    restore_session()
except Exception:
    pass
```

**Testing:**
```markdown
### **Session Restore Testing:**
- [ ] Visit home page → check st.session_state.user_id is set (if logged in)
- [ ] Navigate to Quantum PV → auth persists
- [ ] Navigate to Profile → auth persists
- [ ] Logout → auth cleared
- [ ] Login → auth restored
- [ ] Refresh page → auth persists
- [ ] Check logs: only 1 restore_session() call per page load
```

**Session Management Impact:**
- ✅ **Fixes:** Multiple restore_session() calls
- ✅ **Fixes:** Race conditions
- ✅ **Fixes:** Auth state inconsistency
- ✅ **Fixes:** Timing issues with restore

---

#### **Phase 1.2: Centralize Navigation Action Handling** ⚠️ **CRITICAL**
**Duration:** 1-2 days

**Problem:** nav_action handlers duplicated in 5+ files, missing on admin pages (breaks logout)

**Solution:** Single centralized handler

**Files to Create:**

**1. Create `src/ui/nav_handler.py`:**
```python
"""
Centralized navigation action handler.

This module handles all navigation actions triggered by the top navigation bar.
Call handle_navigation_actions() once per page, typically after render_top_nav().

Navigation actions are set via st.session_state.nav_action and handled here:
- login: Navigate to Login page
- register: Navigate to Register page  
- profile: Navigate to Profile page
- logout: Logout user and redirect to home
"""

import streamlit as st


def handle_navigation_actions():
    """
    Handle all navigation actions from top nav.
    
    Call this once per page, typically after render_top_nav():
    
        from src.ui.top_nav import render_top_nav
        from src.ui.nav_handler import handle_navigation_actions
        
        render_top_nav()
        handle_navigation_actions()
    
    This prevents the need for every page to implement its own nav action handling.
    """
    try:
        nav_action = st.session_state.get("nav_action")
        
        if not nav_action:
            return
        
        # Clear action immediately to prevent loops
        del st.session_state.nav_action
        
        # Handle different actions
        if nav_action == "login":
            st.switch_page("pages/Login.py")
            
        elif nav_action == "register":
            st.switch_page("pages/Register.py")
            
        elif nav_action == "profile":
            st.switch_page("pages/Profile.py")
            
        elif nav_action == "logout":
            try:
                from src.auth.auth import logout_user
                logout_user()
                st.success("✅ Logged out successfully!")
                st.rerun()
            except Exception as e:
                st.error(f"Logout failed: {e}")
                # Clear action anyway to prevent infinite loops
                if "nav_action" in st.session_state:
                    del st.session_state.nav_action
        
        else:
            # Unknown action - log and ignore
            st.warning(f"Unknown navigation action: {nav_action}")
            
    except Exception as e:
        # Error handling - don't break the page
        st.error(f"Navigation error: {e}")
        # Clear action to prevent infinite loops
        if "nav_action" in st.session_state:
            del st.session_state.nav_action
```

**Files to Modify:**

**2. Update `src/ui/top_nav.py`:**
```python
def render_top_nav() -> None:
    """Render fixed top navigation bar with page links."""
    
    # REMOVED: restore_session() call (now in initialize_session only)
    
    # Existing rendering logic...
    # ...
    
    # REMOVED: This section (lines 495-512)
    # Navigation handling is now in nav_handler.py
    # Pages call handle_navigation_actions() after render_top_nav()
```

**3. Update ALL page files:**

Add after `render_top_nav()`:
```python
from src.ui.top_nav import render_top_nav
from src.ui.nav_handler import handle_navigation_actions

# Render top nav
render_top_nav()

# Handle navigation actions (logout, profile, etc.)
handle_navigation_actions()
```

Remove old handler functions:
```python
# DELETE THESE FUNCTIONS:
def _handle_nav_actions():
    nav_action = st.session_state.get("nav_action")
    if nav_action == "login":
        st.switch_page("pages/Login.py")
    # ...
```

**Files to update:**
- `app.py`
- `pages/1_Quantum_PV_Explorer.py` (remove lines 33-50, 105-122)
- `pages/2_Social_AE_Explorer.py` (remove lines 24-41, 98)
- `pages/3_AE_Explorer.py`
- `pages/Billing.py` ← **FIXES MISSING HANDLER**
- `pages/Profile.py`
- `pages/Login.py`
- `pages/Register.py`
- `pages/Settings.py` ← **FIXES MISSING HANDLER**
- `pages/API_Keys.py` ← **FIXES MISSING HANDLER**
- `pages/System_Diagnostics.py` ← **FIXES MISSING HANDLER**
- `pages/Onboarding.py`
- `pages/Demo_Home.py`
- `pages/Demo_Landing.py`
- `pages/98_🔐_Data_Source_Manager.py`
- `pages/Admin_Data_Sources.py`

**Testing:**
```markdown
### **Navigation Action Testing:**
- [ ] Logout from home page → works
- [ ] Logout from Quantum PV → works
- [ ] Logout from Social AE → works
- [ ] Logout from Billing page → works ✅ **NEW**
- [ ] Logout from Settings page → works ✅ **NEW**
- [ ] Logout from API Keys page → works ✅ **NEW**
- [ ] Logout from System Diagnostics page → works ✅ **NEW**
- [ ] Profile link from all pages → works
- [ ] Login/Register links from all pages → works
- [ ] No duplicate handlers in page files
```

**Session Management Impact:**
- ✅ **Fixes:** Logout doesn't work on some pages
- ✅ **Fixes:** Inconsistent nav_action clearing

---

#### **Phase 1.3: Fix Session Reset Logic** ⚠️ **CRITICAL**
**Duration:** 1 day

**Problem:** Session reset clears navigation keys, loses workspace/processing mode

**Solution:** Comprehensive preservation list

**Files to Modify:**

**1. Update `src/ui/sidebar.py` (lines 75-97):**
```python
# Expanded preservation list
auth_and_state_keys_to_preserve = [
    # ========================================
    # Authentication State (DO NOT CLEAR)
    # ========================================
    "user_id",
    "user_email",
    "user_session",
    "authenticated",
    "user_profile",
    "user_organization",
    "user_role",
    
    # ========================================
    # Navigation & Workspace (DO NOT CLEAR)
    # ========================================
    "active_workspace",      # Current workspace (explorer/governance/inspector/etc.)
    "sidebar_mode",          # Sidebar display mode
    "nav_action",            # Pending navigation action
    "current_page",          # Active page tracking
    
    # ========================================
    # Processing & Engine State (DO NOT CLEAR)
    # ========================================
    "processing_mode",           # auto/server/local processing mode
    "processing_mode_reason",    # Why this mode was selected
    "processing_mode_override",  # User manual override flag
    "hybrid_master_engine",      # Hybrid engine instance (DON'T RECREATE)
    "browser_capabilities",      # Detected browser capabilities
    
    # ========================================
    # Feature Flags & UI State (DO NOT CLEAR)
    # ========================================
    "debug_mode",                # Developer debug mode
    "analytics_enabled",         # Analytics tracking enabled
    "quantum_enabled",           # Quantum ranking enabled
    "include_social_ae",         # Social AE integration enabled
]

# Preserve state
preserved_state = {}
for key in auth_and_state_keys_to_preserve:
    if key in st.session_state:
        preserved_state[key] = st.session_state[key]

# Clear all session state (filters, data, results)
for k in list(st.session_state.keys()):
    del st.session_state[k]

# Restore preserved state
for key, value in preserved_state.items():
    st.session_state[key] = value

# Add helpful message
st.success(
    "✅ Session reset complete!\n\n"
    "**Cleared:** Query results, filters, cached data\n\n"
    "**Preserved:** Login state, workspace, processing mode, engine settings"
)
```

**Testing:**
```markdown
### **Session Reset Testing:**
- [ ] Start on "governance" workspace → reset → still on "governance"
- [ ] Set processing_mode="local" → reset → still "local"
- [ ] Enable quantum_enabled → reset → still enabled
- [ ] Enable debug_mode → reset → still enabled
- [ ] Have pending nav_action → reset → action preserved
- [ ] Load data → reset → data cleared ✅
- [ ] Set filters → reset → filters cleared ✅
- [ ] Run query → reset → results cleared ✅
- [ ] Check auth → reset → still authenticated ✅
- [ ] Check hybrid_master_engine → reset → same instance ✅
```

**Session Management Impact:**
- ✅ **Fixes:** Session reset nukes nav keys
- ✅ **Fixes:** Workspace lost after reset
- ✅ **Fixes:** Processing mode lost after reset
- ✅ **Fixes:** Hybrid engine lost after reset
- ✅ **Fixes:** Page navigation clears session

---

#### **Phase 1.4: Archive Dead Code** 🧹
**Duration:** 1 day

**Problem:** 5 unused navigation files create confusion

**Solution:** Archive (don't delete) for future reference

**Files to Archive:**

**1. Review files for unique features before archiving:**
```bash
# Check for any imports of these files
grep -r "from src.ui.layout.topnav import" .
grep -r "from src.ui.layout.sidebar import" .
grep -r "from src.ui.components.navigation import" .
grep -r "from src.ui.sidebar_enhanced import" .
grep -r "from src.ui.sidebar_final import" .

# Should return nothing - these files are unused
```

**2. Create archive directory and README:**
```bash
mkdir -p archived/unused_navigation
```

Create `archived/unused_navigation/README.md`:
```markdown
# Archived Navigation Files

These files were removed during the Navigation Architecture Refactoring (2025-12-03).

## Why Archived?
- Not imported or used anywhere in codebase
- Multiple competing implementations caused confusion
- Kept for reference/historical purposes

## Files:
1. `topnav.py.archived` - Unused Streamlit-native top nav
2. `layout_sidebar.py.archived` - Unused sidebar with routes.py integration
3. `components_navigation.py.archived` - Unused alternative navigation component
4. `sidebar_enhanced.py.archived` - Unused enhanced sidebar variant
5. `sidebar_final.py.archived` - Unused final sidebar variant

## To Restore:
```bash
# Remove .archived suffix and move back to original location
cp archived/unused_navigation/topnav.py.archived src/ui/layout/topnav.py
```

## Unique Features to Consider:
- `layout_sidebar.py.archived`: Shows route map integration pattern
- `sidebar_enhanced.py.archived`: Good UI organization examples
- `sidebar_final.py.archived`: Compact/expanded mode toggle

These patterns were reviewed and incorporated into the final navigation design where appropriate.
```

**3. Archive files:**
```bash
mv src/ui/layout/topnav.py archived/unused_navigation/topnav.py.archived
mv src/ui/layout/sidebar.py archived/unused_navigation/layout_sidebar.py.archived
mv src/ui/components/navigation.py archived/unused_navigation/components_navigation.py.archived
mv src/ui/sidebar_enhanced.py archived/unused_navigation/sidebar_enhanced.py.archived
mv src/ui/sidebar_final.py archived/unused_navigation/sidebar_final.py.archived
```

**Testing:**
```markdown
### **Dead Code Removal Testing:**
- [ ] App still runs (no import errors)
- [ ] All pages load correctly
- [ ] Navigation still works
- [ ] grep confirms no imports of archived files
- [ ] Archive directory has README
- [ ] Can restore from archive if needed
```

---

#### **Phase 1.5: Handle Streamlit Auto-Sidebar**
**Duration:** 0.5 day

**Problem:** Streamlit auto-generates sidebar nav from pages/ directory

**Solution:** Hide with CSS (quick, reversible)

**Files to Modify:**

**1. Update `src/styles.py`:**
```python
def apply_theme():
    """Apply centralized theme stylesheet."""
    
    st.markdown("""
    <style>
    /* Existing styles... */
    
    /* ========================================
       Hide Streamlit Auto-Generated Sidebar Navigation
       ======================================== */
    
    /* Hide the auto-generated page navigation */
    section[data-testid="stSidebarNav"] {
        display: none !important;
    }
    
    /* Alternative: If above doesn't work, try: */
    [data-testid="stSidebarNav"] {
        display: none !important;
    }
    
    /* Note: We use custom navigation in sidebar.py instead */
    
    </style>
    """, unsafe_allow_html=True)
```

**Testing:**
```markdown
### **Auto-Sidebar Testing:**
- [ ] Open app → auto-sidebar not visible
- [ ] Custom sidebar still visible
- [ ] Custom sidebar navigation works
- [ ] No visual glitches
- [ ] Works across all pages
```

---

#### **Phase 1 Complete: Verification**

**Backup before testing:**
```bash
cp -r src/ backups/navigation_refactor/phase1/src/
cp -r pages/ backups/navigation_refactor/phase1/pages/
cp app.py backups/navigation_refactor/phase1/
```

**Full Phase 1 Test Suite:**
```markdown
### **Session Management:**
- [ ] restore_session() called only once per page load
- [ ] Auth persists across page navigation
- [ ] Logout works from all pages (including admin)
- [ ] Login works and restores session
- [ ] Session reset preserves 15+ keys
- [ ] No race conditions observed

### **Navigation:**
- [ ] All page files have nav_handler call
- [ ] No duplicate nav_action handlers
- [ ] Profile/logout work from all pages
- [ ] Admin pages (Billing, Settings, API Keys, System Diagnostics) have working nav

### **Session Reset:**
- [ ] Workspace preserved after reset
- [ ] Processing mode preserved after reset
- [ ] Hybrid engine preserved after reset
- [ ] Auth state preserved after reset
- [ ] Data/filters cleared after reset

### **Dead Code:**
- [ ] 5 files archived
- [ ] No import errors
- [ ] Archive README exists
- [ ] Can restore from archive

### **Auto-Sidebar:**
- [ ] Streamlit auto-sidebar hidden
- [ ] Custom sidebar visible and working

### **No UX Changes:**
- [ ] App looks identical to before
- [ ] All functionality works as before
- [ ] No new bugs introduced
```

**Rollback Test:**
```bash
# Test that we can rollback if needed
cp -r backups/navigation_refactor/phase0/src/ src/
cp -r backups/navigation_refactor/phase0/pages/ pages/
cp backups/navigation_refactor/phase0/app.py app.py

# Verify app works
# Then restore Phase 1 changes

cp -r backups/navigation_refactor/phase1/src/ src/
cp -r backups/navigation_refactor/phase1/pages/ pages/
cp backups/navigation_refactor/phase1/app.py app.py
```

---

### **Phase 2: Route Integration (Keep Rendering)**
**Duration:** 3-4 days  
**Risk:** Medium (structural changes, but rendering unchanged)

#### **Objectives:**
- Create single source of truth (routes.py)
- Top nav reads from routes.py (but keeps HTML/JS rendering)
- Sidebar adds navigation section from routes.py
- All pages become discoverable

---

#### **Phase 2.1: Extend routes.py with Complete Metadata**
**Duration:** 1 day

**Files to Modify:**

**1. Refactor `src/ui/layout/routes.py`:**
```python
"""
Route Configuration - Single Source of Truth for Navigation

This module defines all application routes, their metadata, and access controls.
The navigation system (top nav + sidebar) reads from this file to build menus.

Adding a new page:
1. Add route definition here with full metadata
2. Create page file in pages/ directory
3. Navigation appears automatically
"""

from typing import Dict, List, Optional
from dataclasses import dataclass, field


@dataclass
class Route:
    """
    Complete route definition with metadata.
    
    Attributes:
        route: Unique route identifier (e.g., "quantum_pv")
        page: Streamlit page filename without .py (e.g., "1_Quantum_PV_Explorer")
        title: Display name in navigation (e.g., "Quantum PV Explorer")
        icon: Emoji icon (e.g., "⚛️")
        category: Navigation category (e.g., "Data Explorer")
        requires_auth: Whether login is required
        roles: List of allowed roles (empty = all authenticated users)
        visible_in_nav: Show in navigation menus
        nav_location: Where to show ("top", "sidebar", "both")
        description: Tooltip/help text (optional)
    """
    route: str
    page: str
    title: str
    icon: str
    category: str
    requires_auth: bool = False
    roles: List[str] = field(default_factory=list)
    visible_in_nav: bool = True
    nav_location: str = "both"  # "top", "sidebar", or "both"
    description: str = ""


# ========================================
# MAIN ROUTES
# ========================================

MAIN_ROUTES: Dict[str, Route] = {
    "home": Route(
        route="home",
        page="app",  # Special case: landing page
        title="Home",
        icon="🏠",
        category="Main",
        requires_auth=False,
        visible_in_nav=True,
        nav_location="top",
        description="Application home page"
    ),
    
    # ===== Data Explorer =====
    "quantum_pv": Route(
        route="quantum_pv",
        page="1_Quantum_PV_Explorer",
        title="Quantum PV Explorer",
        icon="⚛️",
        category="Data Explorer",
        requires_auth=True,  # Handles sensitive data
        visible_in_nav=True,
        nav_location="both",
        description="FAERS data analysis with quantum-inspired ranking"
    ),
    "social_ae": Route(
        route="social_ae",
        page="2_Social_AE_Explorer",
        title="Social AE Explorer",
        icon="🌐",
        category="Data Explorer",
        requires_auth=False,  # Public demo feature
        visible_in_nav=True,
        nav_location="both",
        description="Social media adverse event intelligence"
    ),
    "ae_explorer": Route(
        route="ae_explorer",
        page="3_AE_Explorer",
        title="AE Explorer",
        icon="📊",
        category="Data Explorer",
        requires_auth=True,
        visible_in_nav=True,
        nav_location="sidebar",
        description="Adverse event data explorer"
    ),
    "multi_dimensional": Route(
        route="multi_dimensional",
        page="3_Multi_Dimensional_Explorer",
        title="Multi-Dimensional Explorer",
        icon="📈",
        category="Data Explorer",
        requires_auth=True,
        visible_in_nav=True,
        nav_location="sidebar",
        description="Multi-dimensional data analysis"
    ),
    
    # ===== Intelligence =====
    "safety_copilot": Route(
        route="safety_copilot",
        page="4_Safety_Copilot",
        title="Safety Copilot",
        icon="🤖",
        category="Intelligence",
        requires_auth=True,
        visible_in_nav=True,
        nav_location="both",
        description="AI-powered safety intelligence assistant"
    ),
    "mechanism_explorer": Route(
        route="mechanism_explorer",
        page="5_Mechanism_Explorer",
        title="Mechanism Explorer",
        icon="🔬",
        category="Intelligence",
        requires_auth=True,
        visible_in_nav=True,
        nav_location="sidebar",
        description="Explore mechanism of action and drug interactions"
    ),
    "knowledge_graph": Route(
        route="knowledge_graph",
        page="5_Knowledge_Graph",
        title="Knowledge Graph",
        icon="