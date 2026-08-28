import os
import time
import json
import random
import datetime
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.wait import WebDriverWait
from selenium.webdriver.support.ui import Select

# ---------------------------------------------------------------------------
# [INIT] Script metadata
# ---------------------------------------------------------------------------
scriptRunTimestamp = datetime.datetime.now()
print("[INIT] " + "=" * 60)
print("[INIT] scriptRunTimestamp = " + str(scriptRunTimestamp))
print("[INIT] scriptname = csBankJourneyZoningFunnel_CSQXP.py")

# ---------------------------------------------------------------------------
# [INIT] Site config — point this at your local dev server or your deployed
# Vercel domain via CSQBANK_BASE_URL, e.g. https://your-csqbank.vercel.app
# ---------------------------------------------------------------------------
siteBaseUrl = os.environ.get("CSQBANK_BASE_URL", "http://localhost:3000").rstrip("/")
print("[INIT] siteBaseUrl = " + siteBaseUrl)

# ---------------------------------------------------------------------------
# [INIT] Load customer persona
#
# Login here is frictionless (any email works — see routes/auth.js), so
# "returning" simply means reusing the exact same email across runs so
# history accumulates on that identity, not a pre-seeded DB row like the
# ecommerce-main reference script uses. "New" appends a unique alias so
# registration always creates a fresh persona.
# ---------------------------------------------------------------------------
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PERSONA_FILE = os.path.join(SCRIPT_DIR, "csBankCustomerPersonas_CSQXP.json")

with open(PERSONA_FILE, "r") as f:
    customerData = json.load(f)

print("[INIT] Loading user profiles from: " + PERSONA_FILE)
print("[INIT] userData loaded — " + str(len(customerData)) + " profiles available")

# 12 curated Chrome-only UA strings — Chrome-only on purpose, matching the
# ecommerce-main script's rationale: the CSQ tag branches on navigator.userAgent
# for Safari detection, so spoofing a non-Chrome UA on a real Chrome engine
# could push a session down a code path that doesn't match the real browser.
UA_POOL = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 11.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 12_7_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
]

# ---------------------------------------------------------------------------
# [INIT] Path selection — weighted
#
#   Path 1 – Signup & Onboarding              weight 25 (~25%)
#   Path 2 – Happy Path Everyday Banking       weight 35 (~35%)
#   Path 3 – Frustrated Transfer (API Error)   weight 25 (~25%)
#   Path 4 – Bill Pay Form Friction            weight 15 (~15%)
#
# Loan applications are handled entirely by the separate
# csBankLoanApplicationFunnel_CSQXP.py script — see its module comment for
# why loans need their own stable-identity persona pool and cleanup pass,
# which doesn't fit this script's one-off-persona-per-run model.
# ---------------------------------------------------------------------------
PATH_WEIGHTS = [25, 35, 25, 15]
PATH_NAMES = [
    "Signup & Onboarding",
    "Happy Path Everyday Banking",
    "Frustrated Transfer (API Error)",
    "Bill Pay Form Friction",
]
population = list(range(1, 5))
selectedPath = random.choices(population, weights=PATH_WEIGHTS, k=1)[0]
if os.environ.get("CSQBANK_FORCE_PATH"):
    selectedPath = int(os.environ["CSQBANK_FORCE_PATH"])
selectedPathName = PATH_NAMES[selectedPath - 1]

# Path 1 is always a brand-new registration. Every other path logs in as a
# returning persona (exact email reused across runs).
isReturningUser = selectedPath != 1
randomPersonaSelector = random.randint(0, len(customerData) - 1)

userAgentString = UA_POOL[randomPersonaSelector % len(UA_POOL)]

persona = customerData[randomPersonaSelector]
customerName = persona["customerName"]
customerNameArray = customerName.split()
customerFirstName = customerNameArray[0]
customerLastName = customerNameArray[-1]
customerEmailOriginal = persona["customerEmail"]
customerPassword = persona["customerPassword"]

if isReturningUser:
    customerEmail = customerEmailOriginal.lower().strip()
else:
    appendId = random.randint(1000000000000000, 9999999999999999)
    emailUser = customerEmailOriginal.split("@")[0]
    emailDomain = customerEmailOriginal.split("@")[1]
    customerEmail = emailUser + "+" + str(appendId) + "@" + emailDomain

print("[INIT] firstName        = " + customerFirstName)
print("[INIT] lastName         = " + customerLastName)
print("[INIT] email            = " + customerEmail)
print("[INIT] isReturningUser  = " + str(isReturningUser))
print("[INIT] user_agent       = " + userAgentString[:72] + "...")
print("[INIT] selectedPath     = " + str(selectedPath) + " (" + selectedPathName + ")")
print("[INIT] " + "=" * 60)

# ---------------------------------------------------------------------------
# [BROWSER] Chrome setup
# ---------------------------------------------------------------------------
print("[BROWSER] Initialising Chrome...")

options = webdriver.ChromeOptions()
options.add_argument("--headless=new")
options.add_argument("--no-sandbox")
options.add_argument("--disable-dev-shm-usage")
options.add_argument("--disable-gpu")
options.add_argument("--window-size=1920,1080")
options.add_argument("user-agent=" + userAgentString)
options.page_load_strategy = "normal"

driver = webdriver.Chrome(options=options)
driver.set_window_position(0, 0)
driver.set_window_size(1920, 1080)
print("[BROWSER] Chrome launched — window size = " + str(driver.get_window_size()))

driver.execute_cdp_cmd("Network.clearBrowserCookies", {})
driver.execute_cdp_cmd("Network.clearBrowserCache", {})
print("[BROWSER] Cookies and cache cleared on launch")

# Deliberately not injecting a spoofed Referer header via CDP here — forcing
# Network.setExtraHTTPHeaders on the top-level navigation reliably triggers
# Chrome's own ERR_BLOCKED_BY_CLIENT interstitial (confirmed while building
# this script), so it's not a safe technique to carry over from
# ecommerce-main's version despite that script using it successfully.


# ---------------------------------------------------------------------------
# Utility helpers
# ---------------------------------------------------------------------------
def log(prefix, msg):
    print("[" + prefix + "] " + msg)

def wait(lo=0.8, hi=2.2):
    time.sleep(random.uniform(lo, hi))

def scroll_to(element):
    driver.execute_script("arguments[0].scrollIntoView({behavior:'smooth',block:'center'})", element)
    time.sleep(random.uniform(0.6, 1.2))

def scroll_to_top():
    driver.execute_script("window.scrollTo({top:0,behavior:'smooth'})")
    time.sleep(random.uniform(0.5, 1.0))

def page_height():
    return driver.execute_script("return document.body.scrollHeight")

def hover(element, duration=600):
    try:
        if element.size["width"] == 0 or element.size["height"] == 0:
            return
    except Exception as _e:
        if "invalid session id" in str(_e).lower():
            raise
        return
    ActionChains(driver, duration=duration).move_to_element(element).perform()
    time.sleep(random.uniform(0.4, 0.9))

def hover_click(element, wait_after=2.0):
    try:
        if element.size["width"] == 0 or element.size["height"] == 0:
            return
    except Exception as _e:
        if "invalid session id" in str(_e).lower():
            raise
        return
    ActionChains(driver, duration=random.randint(600, 1000)).move_to_element(element).perform()
    time.sleep(random.uniform(0.3, 0.7))
    element.click()
    time.sleep(wait_after)

def quick_rage_click_by_id(element_id, clicks=4, delay=0.15):
    """Rapid click burst on an element already guarded against real navigation
    (blocked via preventDefault by the caller) — 3+ clicks within 2s is a
    weight-2 rage-click signal in CSQ's decision tree."""
    el = try_find(element_id, timeout=3)
    if not el:
        return
    for _ in range(clicks):
        try:
            el.click()
            time.sleep(delay)
        except Exception:
            pass

def excessive_hover(element_id, count=5, hover_ms=500):
    """5+ discrete hovers on the same element — a hesitation signal distinct
    from rage click (hovering back and forth, not clicking)."""
    el = try_find(element_id, timeout=3)
    if not el:
        return
    for _ in range(count):
        try:
            hover(el, duration=hover_ms)
            ActionChains(driver).move_by_offset(20, 20).perform()
            time.sleep(0.15)
        except Exception:
            pass

def find(element_id, timeout=10):
    return WebDriverWait(driver, timeout).until(EC.presence_of_element_located((By.ID, element_id)))

def find_clickable(element_id, timeout=10):
    return WebDriverWait(driver, timeout).until(EC.element_to_be_clickable((By.ID, element_id)))

def try_find(element_id, timeout=5):
    try:
        return WebDriverWait(driver, timeout).until(EC.presence_of_element_located((By.ID, element_id)))
    except Exception:
        return None

def full_page_scroll(label="reading page"):
    ph = page_height()
    step = random.randint(300, 500)
    pos = 0
    log("SCROLL", label + " — page height = " + str(ph) + "px, step = " + str(step) + "px")
    while pos < ph:
        pos += step
        driver.execute_script("window.scrollBy({top:" + str(step) + ",behavior:'smooth'})")
        time.sleep(random.uniform(0.5, 1.1))
    time.sleep(random.uniform(0.8, 1.5))

def partial_page_scroll(stop_fraction=0.5, label=""):
    ph = page_height()
    target = int(ph * stop_fraction)
    step = random.randint(280, 420)
    pos = 0
    if label:
        log("SCROLL", label + " — scrolling to ~" + str(int(stop_fraction * 100)) + "% (" + str(target) + "px)")
    while pos < target:
        pos += step
        driver.execute_script("window.scrollBy({top:" + str(step) + ",behavior:'smooth'})")
        time.sleep(random.uniform(0.5, 1.0))


# ---------------------------------------------------------------------------
# CS tracking helpers
# ---------------------------------------------------------------------------
def cs_check():
    try:
        WebDriverWait(driver, 12).until(
            lambda d: d.execute_script("if(typeof _uxa=='object'){return true;}")
        )
        log("MAIN", "_uxa CS Library confirmed present")
    except Exception:
        log("MAIN", "_uxa not found — CS may not be installed (set CSQ_TAG_ID)")

def cs_identify():
    driver.execute_script(
        "if(typeof _uxa!=='undefined') _uxa.push(['trackPageEvent','@user-identifier@" + customerEmail + "']);"
    )
    log("MAIN", "CS Identify sent for " + customerEmail)

# Numeric index required first by setCustomVariable (1-20) — kept stable
# across every script that calls this so CSQ's Custom Variables reports stay
# keyed consistently by index, not name.
CS_CUSTOM_VAR_INDEX = {
    "script_name": 1,
    "customerType": 2,
    "selectedPath": 3,
    "pathName": 4,
    "sessionOutcome": 5,
    "channel": 6,
    "errorType": 7,
    "formAbandonStep": 8,
}

def cs_var(key, value):
    index = CS_CUSTOM_VAR_INDEX[key]
    driver.execute_script(
        "if(typeof _uxa!=='undefined') _uxa.push(['setCustomVariable'," + str(index) + ",'" + key + "','" + str(value) + "','visit']);"
    )
    log("MAIN", "CS dynamic variable set: " + key + " = " + str(value))

def cs_event(name):
    driver.execute_script("if(typeof _uxa!=='undefined') _uxa.push(['trackPageEvent','" + name + "']);")
    log("MAIN", "CS event fired: '" + name + "'")


# ---------------------------------------------------------------------------
# Marketing site helpers (Path 1 — Signup & Onboarding)
# ---------------------------------------------------------------------------
def load_marketing_home():
    driver.get(siteBaseUrl + "/")
    time.sleep(random.uniform(3, 5))
    log("MAIN", "Marketing homepage loaded — URL = " + driver.current_url)
    cs_check()

def browse_marketing_site():
    """Scroll the homepage, hover a couple of nav links, and optionally read
    the Account Types page before heading to signup — zoning + a coherent
    acquisition-to-conversion story."""
    scroll_to_top()
    full_page_scroll(label="reading marketing homepage")

    nav_ids = random.sample(
        ["marketing-nav-about", "marketing-nav-features", "marketing-nav-account-types"], 2
    )
    for nav_id in nav_ids:
        el = try_find(nav_id, timeout=3)
        if el:
            hover(el, duration=random.randint(400, 800))

    if random.random() < 0.4:
        el = try_find("marketing-nav-account-types", timeout=3)
        if el:
            hover_click(el, wait_after=random.uniform(2, 3))
            partial_page_scroll(stop_fraction=random.uniform(0.4, 0.8), label="reading account types")
            log("MAIN", "Visited Account Types page before signing up")


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------
def register_account():
    log("MAIN", "Navigating to registration page")
    driver.get(siteBaseUrl + "/signup")
    time.sleep(random.uniform(2, 3))

    nameField = find_clickable("register-name")
    hover_click(nameField, wait_after=0.4)
    nameField.send_keys(customerFirstName + " " + customerLastName)
    wait(0.5, 1.0)

    emailField = find_clickable("register-email")
    hover_click(emailField, wait_after=0.4)
    emailField.send_keys(customerEmail)
    wait(0.5, 1.0)

    pwField = find_clickable("register-password")
    hover_click(pwField, wait_after=0.4)
    pwField.send_keys(customerPassword)
    wait(0.6, 1.2)

    submitBtn = find_clickable("register-submit")
    hover_click(submitBtn, wait_after=0.5)
    log("MAIN", "Registration submitted for " + customerEmail)

    WebDriverWait(driver, 10).until(lambda d: "/signup" not in d.current_url)
    time.sleep(random.uniform(1, 2))

def login_account():
    log("MAIN", "Navigating to login page")
    driver.get(siteBaseUrl + "/login")
    time.sleep(random.uniform(2, 3))

    emailField = find_clickable("login-email")
    hover_click(emailField, wait_after=0.4)
    emailField.send_keys(customerEmail)
    wait(0.5, 1.0)

    pwField = find_clickable("login-password")
    hover_click(pwField, wait_after=0.4)
    pwField.send_keys(customerPassword)
    wait(0.6, 1.2)

    submitBtn = find_clickable("login-submit")
    hover_click(submitBtn, wait_after=random.uniform(2, 3))
    log("MAIN", "Login submitted for " + customerEmail)

    WebDriverWait(driver, 10).until(lambda d: "/login" not in d.current_url)
    time.sleep(random.uniform(1, 2))

def login_via_topbar_or_direct():
    """Returning users either land on the marketing homepage and click
    'Log In' in the topbar, or navigate straight to /login — mix of both
    for zoning variety on the marketing nav."""
    if random.random() < 0.4:
        load_marketing_home()
        loginLink = find_clickable("topbar-login-link")
        hover_click(loginLink, wait_after=random.uniform(1.5, 2.5))
        emailField = find_clickable("login-email")
        hover_click(emailField, wait_after=0.4)
        emailField.send_keys(customerEmail)
        wait(0.5, 1.0)
        pwField = find_clickable("login-password")
        hover_click(pwField, wait_after=0.4)
        pwField.send_keys(customerPassword)
        wait(0.6, 1.2)
        submitBtn = find_clickable("login-submit")
        hover_click(submitBtn, wait_after=random.uniform(2, 3))
        log("MAIN", "Login submitted for " + customerEmail + " (via marketing topbar)")
        WebDriverWait(driver, 10).until(lambda d: "/login" not in d.current_url)
        time.sleep(random.uniform(1, 2))
    else:
        login_account()


# ---------------------------------------------------------------------------
# Dashboard / nav zoning
# ---------------------------------------------------------------------------
def confirm_dashboard():
    time.sleep(random.uniform(1, 2))
    log("MAIN", "Landed on: " + driver.current_url)
    cs_check()
    cs_identify()
    cs_var("script_name", "csBankJourneyZoningFunnel")
    cs_var("customerType", "returning" if isReturningUser else "new")
    cs_var("selectedPath", str(selectedPath))
    cs_var("pathName", selectedPathName)
    cs_var("channel", "web")

def explore_dashboard():
    scroll_to_top()
    for card_id in ["dashboard-checking-card", "dashboard-savings-card"]:
        el = try_find(card_id, timeout=4)
        if el:
            hover(el, duration=random.randint(400, 700))
    time.sleep(random.uniform(0.5, 1.0))

def simulate_app_nav_hover():
    """Pure hover zoning pass over the app nav — no click-through — so every
    session contributes zoning data regardless of which feature it goes on
    to actually use."""
    log("MAIN", "Starting app nav zoning simulation")
    nav_ids = ["nav-dashboard", "nav-cat-checking", "nav-cat-savings",
               "nav-cat-transfer", "nav-cat-friendpay", "nav-cat-loans"]
    for nav_id in random.sample(nav_ids, random.randint(2, 4)):
        el = try_find(nav_id, timeout=3)
        if not el:
            continue
        if el.size["width"] == 0 or el.size["height"] == 0:
            continue
        ActionChains(driver, duration=random.randint(400, 800)).move_to_element(el).perform()
        time.sleep(random.uniform(0.8, 1.6))
    log("MAIN", "App nav zoning simulation complete")

def open_dropdown_and_click(nav_id, sub_id, wait_after=(3, 5)):
    """Force a Bootstrap dropdown-menu visible via JS (headless Chrome
    doesn't run the hover/click JS that normally opens it) then click a real
    link inside it — same technique as ecommerce-main's nav zoning helper."""
    navEl = try_find(nav_id, timeout=5)
    if not navEl:
        log("MAIN", nav_id + " not found — skipping")
        return False
    ActionChains(driver, duration=random.randint(500, 900)).move_to_element(navEl).perform()
    time.sleep(random.uniform(0.8, 1.5))
    driver.execute_script(
        "var el = document.getElementById('" + nav_id + "');"
        "if (el) { var dm = el.parentElement.querySelector('.dropdown-menu');"
        "if (dm) { dm.classList.add('show'); dm.style.display = 'block'; } }"
    )
    time.sleep(0.3)
    subEl = try_find(sub_id, timeout=4)
    if not subEl:
        log("MAIN", sub_id + " not found after opening dropdown")
        return False
    hover_click(subEl, wait_after=random.uniform(*wait_after))
    log("MAIN", "Navigated via dropdown: " + nav_id + " -> " + sub_id)
    return True

def maybe_logout():
    if random.random() < 0.2:
        driver.get(siteBaseUrl + "/")
        time.sleep(random.uniform(1.5, 2.5))
        if open_dropdown_and_click("nav-user-menu", "nav-logout-btn", wait_after=(1.5, 2.5)):
            log("MAIN", "User logged out to close the session")


# ---------------------------------------------------------------------------
# Happy Path Everyday Banking (Path 2)
# ---------------------------------------------------------------------------
def make_transfer_happy():
    driver.get(siteBaseUrl + "/transfer")
    time.sleep(random.uniform(2, 3))

    fromSelect = find_clickable("transfer-from-account")
    hover(fromSelect)
    Select(fromSelect).select_by_value("checking")
    wait(0.4, 0.8)

    toSelect = find_clickable("transfer-to-account")
    hover(toSelect)
    Select(toSelect).select_by_value("savings")
    wait(0.4, 0.8)

    amountField = find_clickable("transfer-amount")
    hover_click(amountField, wait_after=0.3)
    amount = round(random.uniform(20, 250), 2)
    amountField.send_keys(str(amount))
    wait(0.6, 1.2)

    submitBtn = find_clickable("transfer-submit")
    hover_click(submitBtn, wait_after=random.uniform(3, 5))
    cs_event("TransferCompleted")
    log("MAIN", "Happy-path transfer completed: $" + str(amount) + " checking -> savings")

def pay_bill_happy():
    driver.get(siteBaseUrl + "/checking/pay-bill")
    time.sleep(random.uniform(2, 3))
    payeeSelect = try_find("pay-bill-payee-select", timeout=5)
    if not payeeSelect:
        log("MAIN", "No pay-bill form found — skipping")
        return
    options = payeeSelect.find_elements(By.TAG_NAME, "option")
    if len(options) <= 1:
        log("MAIN", "No payees on file — skipping happy-path bill pay")
        return
    hover(payeeSelect)
    Select(payeeSelect).select_by_index(random.randint(1, len(options) - 1))
    wait(0.4, 0.8)

    amountField = find_clickable("pay-bill-amount")
    hover_click(amountField, wait_after=0.3)
    amount = round(random.uniform(15, 180), 2)
    amountField.send_keys(str(amount))
    wait(0.6, 1.2)

    submitBtn = find_clickable("pay-bill-submit")
    hover_click(submitBtn, wait_after=random.uniform(3, 5))
    cs_event("BillPaid")
    log("MAIN", "Happy-path bill payment completed: $" + str(amount))

def friend_pay_happy():
    driver.get(siteBaseUrl + "/friend-pay")
    time.sleep(random.uniform(2, 3))
    contactSelect = try_find("friend-contact-select", timeout=5)
    if not contactSelect:
        return
    options = contactSelect.find_elements(By.TAG_NAME, "option")
    if len(options) <= 1:
        log("MAIN", "No friend-pay contacts on file — skipping")
        return
    hover(contactSelect)
    Select(contactSelect).select_by_index(random.randint(1, len(options) - 1))
    wait(0.4, 0.8)

    fromSelect = find_clickable("friend-from-account")
    Select(fromSelect).select_by_value("checking")
    wait(0.3, 0.6)

    amountField = find_clickable("friend-amount")
    hover_click(amountField, wait_after=0.3)
    amount = round(random.uniform(10, 80), 2)
    amountField.send_keys(str(amount))
    wait(0.6, 1.2)

    submitBtn = find_clickable("friend-submit")
    hover_click(submitBtn, wait_after=random.uniform(3, 5))
    cs_event("FriendPaySent")
    log("MAIN", "Happy-path Pay a Friend completed: $" + str(amount))


# ---------------------------------------------------------------------------
# Frustrated Transfer — API Error (Path 3)
#
# routes/transfer.js always succeeds once the amount/accounts are valid —
# there's no genuine failure path to demo an outage against. POST
# /api/transfer-verify (routes/demoErrors.js) exists purely so this path can
# fire a real XHR that fails with a realistic body for CSQ Error Analysis,
# while the real transfer-submit button is blocked via preventDefault so the
# rage-click burst registers without silently completing (or corrupting) an
# actual transfer.
# ---------------------------------------------------------------------------
def inject_api_error_transfer():
    log("MAIN", "Injecting API error: POST /api/transfer-verify (503 expected)")
    driver.execute_script("""
        (function() {
            fetch('/api/transfer-verify', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({from_account_type: 'checking', to_account_type: 'savings'})
            })
            .then(function(r) {
                return r.json().then(function(body) {
                    if (!r.ok) {
                        var err = new Error('TransferServiceUnavailable: ' + body.message);
                        err.code = body.code;
                        throw err;
                    }
                });
            })
            .catch(function(e) {
                console.error('[CSQ-DEMO] Transfer API error:', e.message);
                throw e;
            });
        })();
    """)
    time.sleep(random.uniform(1.5, 2.5))
    log("MAIN", "Transfer API error injected — CSQ Error Analysis should capture 503 + body")

def inject_js_error(message):
    driver.execute_script("setTimeout(function(){ throw new Error('" + message + "'); }, 100);")
    time.sleep(random.uniform(0.8, 1.5))
    log("MAIN", "JS error injected: " + message)

def make_transfer_frustrated():
    driver.get(siteBaseUrl + "/transfer")
    time.sleep(random.uniform(2, 3))

    Select(find_clickable("transfer-from-account")).select_by_value("checking")
    wait(0.3, 0.6)
    Select(find_clickable("transfer-to-account")).select_by_value("savings")
    wait(0.3, 0.6)

    amountField = find_clickable("transfer-amount")
    hover_click(amountField, wait_after=0.3)
    amount = round(random.uniform(50, 500), 2)
    amountField.send_keys(str(amount))
    wait(0.8, 1.5)

    inject_api_error_transfer()
    cs_var("errorType", "TransferServiceUnavailable")
    inject_js_error("TransferServiceUnavailable: upstream timeout after 30000ms")

    # Block the real submit before rage-clicking so the burst registers in
    # CSQ without navigating away on the very first click.
    driver.execute_script(
        "var el = document.getElementById('transfer-submit');"
        "if (el) { el._csqBlock = function(e){ e.preventDefault(); };"
        "el.addEventListener('click', el._csqBlock, true); }"
    )
    quick_rage_click_by_id("transfer-submit", clicks=5, delay=0.15)
    log("MAIN", "Rage-clicked transfer-submit while the outage is simulated")
    cs_event("TransferErrorEncountered")
    time.sleep(random.uniform(1.5, 2.5))

    if random.random() < 0.5:
        driver.execute_script(
            "var el = document.getElementById('transfer-submit');"
            "if (el && el._csqBlock) { el.removeEventListener('click', el._csqBlock, true); delete el._csqBlock; }"
        )
        time.sleep(random.uniform(1, 2))
        submitBtn = find_clickable("transfer-submit")
        hover_click(submitBtn, wait_after=random.uniform(3, 5))
        cs_event("TransferRetrySucceeded")
        cs_var("sessionOutcome", "error_recovered")
        log("MAIN", "User retried after the outage and the transfer succeeded")
        return "error_recovered"
    else:
        cs_var("sessionOutcome", "error_abandoned")
        log("MAIN", "User gave up after the rage click and left the transfer page")
        return "error_abandoned"


# ---------------------------------------------------------------------------
# Bill Pay Form Friction (Path 4)
#
# billpay.js genuinely rejects a blank payee name server-side (trim() check)
# and redirects back with a flash error — real app behavior, no fake
# endpoint needed. A value of spaces-only satisfies the HTML5 `required`
# attribute client-side but still trims to empty server-side.
# ---------------------------------------------------------------------------
def pay_bill_form_friction():
    driver.get(siteBaseUrl + "/bill-pay/payees/new")
    time.sleep(random.uniform(2, 3))

    nameField = find_clickable("payee-name")
    hover_click(nameField, wait_after=0.3)
    nameField.send_keys("   ")
    wait(0.5, 1.0)

    submitBtn = find_clickable("payee-submit")
    hover_click(submitBtn, wait_after=random.uniform(2, 3))
    log("MAIN", "Submitted payee form with a blank name — real server-side validation should reject it")
    cs_event("FormValidationErrorShown")
    cs_var("errorType", "PayeeNameRequired")
    time.sleep(random.uniform(1, 2))

    # Block the real submit before rage-clicking so the burst doesn't reload
    # the page on every click.
    driver.execute_script(
        "var el = document.getElementById('payee-submit');"
        "if (el) { el._csqBlock = function(e){ e.preventDefault(); };"
        "el.addEventListener('click', el._csqBlock, true); }"
    )
    quick_rage_click_by_id("payee-submit", clicks=4, delay=0.15)
    log("MAIN", "Rage-clicked Add Payee after the validation error")

    nameField = try_find("payee-name", timeout=5)
    scroll_to(nameField)
    typoName = "Cty Wter Utilty"
    hover_click(nameField, wait_after=0.3)
    nameField.clear()
    nameField.send_keys(typoName)
    time.sleep(random.uniform(1.2, 2.0))
    log("MAIN", "Typed payee name with typos: " + typoName)
    nameField.clear()
    wait(0.5, 1.0)
    correctedName = "City Water Utility"
    nameField.send_keys(correctedName)
    log("MAIN", "Corrected payee name to: " + correctedName)
    wait(0.6, 1.2)

    driver.execute_script(
        "var el = document.getElementById('payee-submit');"
        "if (el && el._csqBlock) { el.removeEventListener('click', el._csqBlock, true); delete el._csqBlock; }"
    )

    if random.random() < 0.3:
        cs_var("sessionOutcome", "abandoned_after_correction")
        cs_var("formAbandonStep", "add_payee")
        log("MAIN", "User abandoned the payee form after correcting the typo")
        return "abandoned_after_correction"

    submitBtn = find_clickable("payee-submit")
    hover_click(submitBtn, wait_after=random.uniform(2, 3))
    cs_event("PayeeAdded")
    cs_var("sessionOutcome", "completed_after_friction")
    log("MAIN", "Payee added successfully after friction")
    return "completed_after_friction"


# ---------------------------------------------------------------------------
# [MAIN]
# ---------------------------------------------------------------------------
sessionOutcome = "unknown"
try:
    if selectedPath == 1:
        load_marketing_home()
        browse_marketing_site()
        ctaId = "home-hero-signup-cta" if random.random() < 0.5 else "marketing-nav-signup-cta"
        ctaEl = try_find(ctaId, timeout=4)
        if ctaEl:
            scroll_to(ctaEl)
            hover_click(ctaEl, wait_after=random.uniform(2, 3))
        register_account()
        confirm_dashboard()
        explore_dashboard()
        simulate_app_nav_hover()
        cs_var("sessionOutcome", "registered")
        sessionOutcome = "registered"

    elif selectedPath == 2:
        login_via_topbar_or_direct()
        confirm_dashboard()
        explore_dashboard()
        simulate_app_nav_hover()
        make_transfer_happy()
        if random.random() < 0.6:
            pay_bill_happy()
        if random.random() < 0.3:
            friend_pay_happy()
        cs_var("sessionOutcome", "completed")
        sessionOutcome = "completed"

    elif selectedPath == 3:
        login_via_topbar_or_direct()
        confirm_dashboard()
        simulate_app_nav_hover()
        sessionOutcome = make_transfer_frustrated()

    else:  # selectedPath == 4
        login_via_topbar_or_direct()
        confirm_dashboard()
        simulate_app_nav_hover()
        sessionOutcome = pay_bill_form_friction()

    maybe_logout()

except Exception as ex:
    log("ERROR", "Unhandled exception during path " + str(selectedPath) + " (" + selectedPathName + "): " + str(ex))
    sessionOutcome = "script_error"

finally:
    print("[DONE] " + "=" * 60)
    print("[DONE] selectedPath    = " + str(selectedPath) + " (" + selectedPathName + ")")
    print("[DONE] customerEmail   = " + customerEmail)
    print("[DONE] sessionOutcome  = " + sessionOutcome)
    print("[DONE] " + "=" * 60)
    driver.quit()
