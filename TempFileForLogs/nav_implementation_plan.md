# 🔧 Navigation Architecture - Complete Implementation Plan

## Executive Summary

This plan addresses **17 identified issues** across 5 problem areas, with prioritized phases to minimize disruption while maximizing impact.

**Timeline:** 3-4 weeks  
**Risk Level:** Medium (requires careful migration)  
**Impact:** High (affects all pages and users)

---

## 📋 Phase 1: Foundation & Quick Wins (Week 1)

### **Priority: CRITICAL**

### 1.1 Centralize Session Restoration ⚠️ **HIGH IMPACT**

**Current State:** 15+ redundant `restore_session()` calls per page load

**Implementation:**

```python
# src/auth/auth.py - Add session restoration guard
_session_restored = False

def restore_session():
    global _session_restored
    if _session_restored:
        return  # Already restored this request
    
    # Existing restoration logic...
    _session_restored = True

# Reset guard on new request (add to app.py)
from src.auth.auth import _reset_session_guard
_reset_session_guard()  # Call before anything else
```

**Changes Required:**
- ✅ Keep call in `initialize_session()` (app_helpers.py line 32)
- ❌ Remove from `render_top_nav()` (top_nav.py line 20)
- ❌ Remove from individual page files (12+ pages)

**Testing:**
- Verify auth persists across page navigation
- Check logout functionality works
- Test cold start (no existing session)

---

### 1.2 Fix Session Reset Logic ⚠️ **DATA LOSS PREVENTION**

**Current State:** Reset clears navigation keys, causing unexpected behavior

**Implementation:**

```python
# src/ui/sidebar.py - Lines 75-97
auth_keys_to_preserve = [
    # Existing auth keys
    "user_id", "user_email", "user_session", "authenticated",
    "user_profile", "user_organization", "user_role",
    
    # ADD: Navigation & workspace keys
    "active_workspace", "processing_mode", "sidebar_mode",
    "nav_action", "current_page",
    
    # ADD: Hybrid engine & browser state
    "hybrid_master_engine", "browser_capabilities",
]
```

**Testing:**
- Reset session while on different workspaces
- Verify workspace selection persists
- Check processing mode isn't lost

---

### 1.3 Centralize Navigation Action Handling ⚠️ **CRITICAL**

**Current State:** Duplicated handlers in 5+ files, missing on admin pages

**Implementation:**

Create `src/ui/nav_handler.py`:

```python
"""
Centralized navigation action handler.
Call once per page to handle all nav_action events.
"""
import streamlit as st

def handle_navigation_actions():
    """
    Handle all navigation actions from top nav.
    Call this once per page, typically after render_top_nav().
    """
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
            st.success("Logged out successfully!")
            st.rerun()
        except Exception as e:
            st.error(f"Logout failed: {e}")
```

**Update top_nav.py:**

```python
# src/ui/top_nav.py - Lines 495-512
# REMOVE this section entirely - move to nav_handler.py
```

**Update all page files:**

```python
# Every page file (app.py, 1_Quantum_PV_Explorer.py, etc.)
from src.ui.top_nav import render_top_nav
from src.ui.nav_handler import handle_navigation_actions

render_top_nav()
handle_navigation_actions()  # Add this line once per page
```

**Files to Update:**
- ✅ `app.py`
- ✅ `pages/1_Quantum_PV_Explorer.py` (remove lines 33-50, 105-122)
- ✅ `pages/2_Social_AE_Explorer.py` (remove lines 24-41)
- ✅ `pages/Billing.py` (add handler)
- ✅ `pages/Settings.py` (add handler)
- ✅ `pages/API_Keys.py` (add handler)
- ✅ `pages/System_Diagnostics.py` (add handler)
- ✅ All other pages (10+ files)

**Testing:**
- Test logout from every page
- Test profile navigation from every page
- Verify admin pages now work correctly

---

### 1.4 Remove Dead Code 🧹 **CLEANUP**

**Files to Delete:**

1. ❌ `src/ui/layout/topnav.py` (unused top nav)
2. ❌ `src/ui/layout/sidebar.py` (unused sidebar)
3. ❌ `src/ui/components/navigation.py` (unused alternative)
4. ❌ `src/ui/sidebar_enhanced.py` (unused variant)
5. ❌ `src/ui/sidebar_final.py` (unused variant)

**Before Deletion:**
- Search codebase for any imports: `grep -r "sidebar_enhanced" .`
- Verify no references exist
- Commit to git first (easy rollback)

**After Deletion:**
- Update `.gitignore` if needed
- Update any documentation referencing these files

---

## 📋 Phase 2: Route Integration (Week 2)

### **Priority: CRITICAL**

### 2.1 Create Single Source of Truth for Routes

**Implementation:**

Enhance existing `src/ui/layout/routes.py`:

```python
"""
Enhanced Route Configuration - Single source of truth
"""
from typing import Dict, Any, Optional, List
from dataclasses import dataclass

@dataclass
class Route:
    """Route definition with all metadata"""
    route: str
    icon: str
    page: str
    category: str
    title: str
    auth_required: bool = False
    roles: List[str] = None  # ["admin", "super_admin"] or None for all
    visible_in_nav: bool = True
    
    def __post_init__(self):
        if self.roles is None:
            self.roles = []

# Main navigation routes
MAIN_ROUTES: Dict[str, Route] = {
    "home": Route(
        route="home",
        icon="🏠",
        page="app",  # Special case: home page
        category="Main",
        title="Home",
        visible_in_nav=True
    ),
    "quantum_pv": Route(
        route="quantum_pv",
        icon="⚛️",
        page="1_Quantum_PV_Explorer",
        category="Data Explorer",
        title="Quantum PV Explorer",
        auth_required=True,
        visible_in_nav=True
    ),
    "social_ae": Route(
        route="social_ae",
        icon="🌐",
        page="2_Social_AE_Explorer",
        category="Data Explorer",
        title="Social AE Explorer",
        auth_required=False,  # Public access
        visible_in_nav=True
    ),
    # Add from existing ROUTES dict...
}

# Admin routes (super_admin only)
ADMIN_ROUTES: Dict[str, Route] = {
    "billing": Route(
        route="billing",
        icon="💳",
        page="Billing",
        category="Admin",
        title="Billing",
        auth_required=True,
        roles=["admin", "super_admin"],
        visible_in_nav=True
    ),
    # Add from existing ADMIN_ROUTES dict...
}

def get_nav_structure(user_role: Optional[str] = None) -> Dict[str, List[Route]]:
    """
    Get navigation structure filtered by user role.
    
    Args:
        user_role: Current user role (None, "user", "admin", "super_admin")
    
    Returns:
        Dict mapping categories to list of routes
    """
    nav = {}
    
    for route_name, route in MAIN_ROUTES.items():
        if not route.visible_in_nav:
            continue
        
        # Check role requirements
        if route.roles and user_role not in route.roles:
            continue
        
        # Group by category
        if route.category not in nav:
            nav[route.category] = []
        nav[route.category].append(route)
    
    # Add admin routes if user has permission
    if user_role in ["admin", "super_admin"]:
        for route_name, route in ADMIN_ROUTES.items():
            if not route.visible_in_nav:
                continue
            
            if route.category not in nav:
                nav[route.category] = []
            nav[route.category].append(route)
    
    return nav

def get_route_by_page(page_name: str) -> Optional[Route]:
    """Get route by page filename"""
    for route in MAIN_ROUTES.values():
        if route.page == page_name:
            return route
    for route in ADMIN_ROUTES.values():
        if route.page == page_name:
            return route
    return None
```

**Migration:**
- Merge existing `ROUTES` dict into new structure
- Add all 15+ missing pages
- Set `visible_in_nav=True` for pages that should appear

---

### 2.2 Update Top Navigation to Use Routes

**Implementation:**

Update `src/ui/top_nav.py` to consume route map:

```python
def render_top_nav() -> None:
    """Render fixed top navigation bar using route map."""
    from src.ui.layout.routes import get_nav_structure
    from src.auth.auth import is_authenticated, get_current_user
    from src.auth.admin_helpers import is_admin, is_super_admin
    
    # Restore session
    restore_session()
    
    # Get user role
    is_auth = is_authenticated()
    user_role = None
    if is_auth:
        if is_super_admin():
            user_role = "super_admin"
        elif is_admin():
            user_role = "admin"
        else:
            user_role = "user"
    
    # Get navigation structure filtered by role
    nav_structure = get_nav_structure(user_role)
    
    # Build navigation HTML dynamically
    nav_items_html = []
    
    # Always show Home
    nav_items_html.append(
        '<a class="nav-link" href="/" data-nav="home" target="_self">🏠 Home</a>'
    )
    
    # Show main categories
    for category in ["Data Explorer", "Intelligence", "Governance", "Workflows"]:
        if category not in nav_structure:
            continue
        
        routes = nav_structure[category]
        if not routes:
            continue
        
        # For now, show first 2-3 items from each category
        # TODO: Add dropdown menus for full category access
        for route in routes[:2]:
            nav_items_html.append(
                f'<a class="nav-link" href="/{route.page}" data-nav="{route.route}" target="_self">{route.icon} {route.title}</a>'
            )
    
    # Build auth buttons/profile dropdown (existing logic)
    # ... rest of implementation
```

**Benefits:**
- Adding new pages only requires updating routes.py
- No manual URL mapping
- Role-based filtering automatic

---

### 2.3 Update Sidebar to Use Routes

**Implementation:**

Update `src/ui/sidebar.py` to add navigation section:

```python
def render_sidebar():
    """Render sidebar with navigation from route map."""
    from src.ui.layout.routes import get_nav_structure
    from src.auth.auth import is_authenticated
    from src.auth.admin_helpers import is_admin, is_super_admin
    
    # Get user role
    user_role = None
    if is_authenticated():
        if is_super_admin():
            user_role = "super_admin"
        elif is_admin():
            user_role = "admin"
        else:
            user_role = "user"
    
    # Get navigation structure
    nav_structure = get_nav_structure(user_role)
    
    # === NEW: Navigation Section ===
    st.markdown("### 🧭 Navigation")
    
    for category, routes in nav_structure.items():
        with st.expander(f"📁 {category}", expanded=False):
            for route in routes:
                if st.button(
                    f"{route.icon} {route.title}",
                    key=f"nav_{route.route}",
                    use_container_width=True
                ):
                    if route.page == "app":
                        st.switch_page("app.py")
                    else:
                        st.switch_page(f"pages/{route.page}.py")
    
    st.markdown("---")
    
    # === Existing sections below ===
    # Workspace selection, filters, controls, etc.
    # ... rest of implementation
```

---

## 📋 Phase 3: Enhanced Navigation UX (Week 3)

### **Priority: HIGH**

### 3.1 Add Dropdown Menus to Top Nav

**Current:** Only 3 items visible  
**Goal:** Show all categories with dropdowns

**Implementation requires:**
- Custom CSS for dropdown menus
- JavaScript for dropdown behavior
- HTML structure for nested menus

**Recommend:** Use Streamlit-native `st.popover()` in sidebar instead of complex JS dropdowns in top nav for better maintainability.

---

### 3.2 Improve Top Nav Click Handling

**Current:** Custom `window.location.href` and postMessage  
**Better:** Use Streamlit-native `st.switch_page()`

**Implementation:**

```python
# Replace JavaScript navigation with data attributes
# Then handle in Python after page load

# In render_top_nav():
st.markdown("""
<script>
document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', function(e) {
        e.preventDefault();
        const page = this.getAttribute('data-page');
        window.parent.postMessage({
            type: 'streamlit:setComponentValue',
            key: 'nav_target',
            value: page
        }, '*');
    });
});
</script>
""", unsafe_allow_html=True)

# Then in handle_navigation_actions():
nav_target = st.session_state.get("nav_target")
if nav_target:
    del st.session_state.nav_target
    if nav_target == "app":
        st.switch_page("app.py")
    else:
        st.switch_page(f"pages/{nav_target}.py")
```

---

### 3.3 Add Active Page Highlighting

**Implementation:**

```python
# In routes.py, add:
def get_current_route() -> Optional[str]:
    """Detect current page from URL or session state"""
    import os
    try:
        # Get current script name
        script_name = os.path.basename(__file__)
        return get_route_by_page(script_name.replace('.py', ''))
    except:
        return None

# In top_nav.py, use this to add 'active' class:
current_route = get_current_route()
for route in routes:
    active_class = "active" if route.route == current_route else ""
    # Add to HTML: class="nav-link {active_class}"
```

---

## 📋 Phase 4: Documentation & Testing (Week 4)

### 4.1 Create Developer Documentation

Create `docs/NAVIGATION_GUIDE.md`:

```markdown
# Navigation System Guide

## Adding a New Page

1. Create page file: `pages/YourPage.py`
2. Add route to `src/ui/layout/routes.py`:
   ```python
   "your_page": Route(
       route="your_page",
       icon="🎯",
       page="YourPage",
       category="Your Category",
       title="Your Page Title",
       auth_required=True,  # or False
       visible_in_nav=True
   )
   ```
3. Done! Page automatically appears in navigation.

## Navigation Structure

- **Top Nav:** Primary sections (Home, Data Explorer, Intelligence, etc.)
- **Sidebar:** Full navigation tree + workspace switching + filters
- **Profile Dropdown:** User-specific actions + admin tools

## Authentication Gates

Set `auth_required=True` in route config to require login.
Set `roles=["admin", "super_admin"]` to restrict by role.
```

---

### 4.2 Testing Checklist

**Navigation Testing:**
- [ ] All 15+ hidden pages now appear in sidebar
- [ ] Top nav shows correct items for each role
- [ ] Profile dropdown works on all pages
- [ ] Logout works from every page
- [ ] Session reset preserves navigation state
- [ ] Workspace switching works correctly
- [ ] Active page highlighting works
- [ ] Auth gates prevent unauthorized access

**Role-Based Testing:**
- [ ] Anonymous user sees: Home, Social AE, Login, Register
- [ ] Authenticated user sees: + Quantum PV, other main pages
- [ ] Admin user sees: + Billing
- [ ] Super admin sees: + Settings, API Keys, System Diagnostics

**Performance Testing:**
- [ ] Page load time acceptable (< 1s)
- [ ] No redundant session restoration
- [ ] No memory leaks from navigation
- [ ] Sidebar render time acceptable

---

## 📊 Success Metrics

### Before Implementation:
- ✅ 15+ pages undiscoverable
- ✅ 15+ `restore_session()` calls per page
- ✅ 5 duplicate nav_action handlers
- ✅ 4 unused sidebar implementations
- ✅ 3 items in top nav

### After Implementation:
- ✅ All pages discoverable via navigation
- ✅ 1 `restore_session()` call per page
- ✅ 1 centralized nav_action handler
- ✅ 0 unused sidebar implementations
- ✅ 10+ items organized in top nav + sidebar

---

## ⚠️ Risk Mitigation

### Breaking Changes:
- Navigation action handling changes (all pages affected)
- Route structure changes (affects any hardcoded URLs)
- Session state key changes (sidebar reset logic)

### Mitigation:
1. **Feature flag:** Add `USE_NEW_NAVIGATION` env var
2. **Gradual rollout:** Test on staging first
3. **Rollback plan:** Keep old files for 1 release cycle
4. **User communication:** Document changes in release notes

### Testing Strategy:
1. **Unit tests:** Test route resolution, role filtering
2. **Integration tests:** Test navigation flows end-to-end
3. **Manual QA:** Test all pages, all roles, all actions
4. **Staging deploy:** 1 week before production

---

## 🎯 Open Questions (From Assessment)

### Q1: Should all routes in routes.py be user-facing now?

**Recommendation:** 
- Set `visible_in_nav=False` for beta/incomplete features
- Set `visible_in_nav=True` for production-ready features
- Document which pages are intentionally hidden

**Decision needed:**
- Executive Dashboard: Production ready? → `visible_in_nav=?`
- Mechanism Explorer: Production ready? → `visible_in_nav=?`
- Workflow Dashboard: Production ready? → `visible_in_nav=?`

### Q2: Should auth gating be consistent?

**Recommendation:**
- **Quantum PV:** Keep `auth_required=True` (handles sensitive data)
- **Social AE:** Keep `auth_required=False` (public demo feature)
- **All other data explorers:** `auth_required=True`
- **Admin pages:** `auth_required=True` + `roles=["admin", "super_admin"]`

**Rationale:** Social AE is a marketing/demo feature, everything else needs auth for data security.

---

## 📁 File Change Summary

### New Files:
- `src/ui/nav_handler.py` (centralized navigation handler)
- `docs/NAVIGATION_GUIDE.md` (developer documentation)

### Modified Files:
- `src/ui/layout/routes.py` (enhanced route structure)
- `src/ui/top_nav.py` (consume route map, remove manual URLs)
- `src/ui/sidebar.py` (add navigation section, preserve keys on reset)
- `src/auth/auth.py` (add session restoration guard)
- `src/app_helpers.py` (keep single restore_session call)
- `app.py` (add nav handler, remove duplicate restore)
- `pages/1_Quantum_PV_Explorer.py` (remove nav handler, add centralized)
- `pages/2_Social_AE_Explorer.py` (remove nav handler, add centralized)
- `pages/Billing.py` (add nav handler)
- `pages/Settings.py` (add nav handler)
- `pages/API_Keys.py` (add nav handler)
- `pages/System_Diagnostics.py` (add nav handler)
- 10+ other page files (add nav handler)

### Deleted Files:
- `src/ui/layout/topnav.py`
- `src/ui/layout/sidebar.py`
- `src/ui/components/navigation.py`
- `src/ui/sidebar_enhanced.py`
- `src/ui/sidebar_final.py`

---

## 🚀 Implementation Order

**Day 1-2:** Phase 1.1-1.2 (Session handling)
**Day 3-4:** Phase 1.3 (Centralized nav handler)
**Day 5:** Phase 1.4 (Cleanup)
**Week 2:** Phase 2.1-2.3 (Route integration)
**Week 3:** Phase 3.1-3.3 (Enhanced UX)
**Week 4:** Phase 4.1-4.2 (Docs & testing)

---

## ✅ Definition of Done

- [ ] All 17 issues from assessment resolved
- [ ] All tests passing
- [ ] Documentation complete
- [ ] Staging deployment successful
- [ ] User acceptance testing passed
- [ ] Production deployment plan approved
- [ ] Rollback plan tested
- [ ] Team training completed

**Estimated Effort:** 60-80 hours over 3-4 weeks
**Team Size:** 1-2 developers + 1 QA engineer
**Risk:** Medium (breaking changes, but well-scoped)
**Impact:** High (improves UX, maintainability, discoverability)
