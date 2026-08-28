import os
import time
import json
import random
import datetime
import psycopg2
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.wait import WebDriverWait
from selenium.webdriver.support.ui import Select

# ---------------------------------------------------------------------------
# [INIT] Script metadata
#
# Split out from csBankJourneyZoningFunnel_CSQXP.py because loans need a
# fundamentally different shape of script: a small STABLE pool of personas
# that get revisited run after run (so a submitted application can actually
# progress to a resolution over several days), plus a cleanup pass for rows
# that never got a bank-side response the way a real applicant would expect.
# Neither fits the "one fresh persona, one path, one session" model the main
# journey script uses.
#
# Meant to be run on a schedule (recommended: ~every 8 hours / 3x a day —
# see project discussion). Every run does three things:
#   1. Reads loan_applications directly from Postgres to see which of the
#      pool's personas currently need a bank-side nudge (this is
#      orchestration, not a simulated user action, so there's no UI
#      equivalent to click through for it).
#   2. Drives a real browser, as that exact persona, through whichever
#      action is due — advancing underwriting, responding to a docs
#      request, or starting a fresh application — so every actual state
#      change and CSQ event still comes from the real app, never a DB
#      shortcut.
#   3. Sweeps stale loan_applications rows past their retention window.
# ---------------------------------------------------------------------------
scriptRunTimestamp = datetime.datetime.now()
print("[INIT] " + "=" * 60)
print("[INIT] scriptRunTimestamp = " + str(scriptRunTimestamp))
print("[INIT] scriptname = csBankLoanApplicationFunnel_CSQXP.py")

siteBaseUrl = os.environ.get("CSQBANK_BASE_URL", "http://localhost:3000").rstrip("/")
databaseUrl = os.environ.get("DATABASE_URL")
if not databaseUrl:
    raise SystemExit("DATABASE_URL is required — used only for orchestration (deciding who's due) and cleanup, never for simulated actions themselves (see module comment).")

print("[INIT] siteBaseUrl = " + siteBaseUrl)

# ---------------------------------------------------------------------------
# [INIT] Tunables
# ---------------------------------------------------------------------------
NEW_APPLICATION_PROBABILITY = 0.05  # per idle pool persona, per run

RETENTION_DRAFT_DAYS = 3            # never-submitted, nobody's coming back for these
RETENTION_DOCS_REQUESTED_DAYS = 10  # stuck waiting on the applicant
RETENTION_IN_FLIGHT_DAYS = 14       # submitted / under_review / docs_submitted
RETENTION_RESOLVED_DAYS = 7         # approved / denied, already served their purpose

# ---------------------------------------------------------------------------
# [INIT] Persona pool — the SAME 50-persona file the main journey script
# uses, but every persona here always logs in with its exact stable email
# (never a +alias). That's what makes "revisit this same applicant later"
# possible at all — see module comment above.
# ---------------------------------------------------------------------------
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PERSONA_FILE = os.path.join(SCRIPT_DIR, "csBankCustomerPersonas_CSQXP.json")

with open(PERSONA_FILE, "r") as f:
    allPersonas = json.load(f)

personaByEmail = {p["customerEmail"].lower().strip(): p for p in allPersonas}
poolEmails = list(personaByEmail.keys())

print("[INIT] Loading user profiles from: " + PERSONA_FILE)
print("[INIT] pool size = " + str(len(poolEmails)) + " personas (all stable identities)")

UA_POOL = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
]


def log(prefix, msg):
    print("[" + prefix + "] " + msg)


# ---------------------------------------------------------------------------
# [DB] Orchestration + cleanup. Deliberately the ONLY place this script
# talks to Postgres directly — see module comment.
# ---------------------------------------------------------------------------
def db_connect():
    return psycopg2.connect(databaseUrl, sslmode="require")


def fetch_pool_states(conn):
    """One row per pool email: their single most-recently-updated loan
    application, or NULLs if they don't have one."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT DISTINCT ON (u.email) u.email, la.id, la.status, la.current_step
            FROM users u
            LEFT JOIN loan_applications la ON la.user_id = u.id
            WHERE u.email = ANY(%s)
            ORDER BY u.email, la.updated_at DESC NULLS LAST
            """,
            (poolEmails,),
        )
        return cur.fetchall()


def plan_actions(rows):
    """Turns each pool persona's current state into exactly one action."""
    plan = []
    for email, loanId, status, currentStep in rows:
        if status is None or status in ("approved", "denied"):
            if random.random() < NEW_APPLICATION_PROBABILITY:
                plan.append({"email": email, "action": "start_new"})
        elif status == "draft":
            plan.append({"email": email, "action": "resume_draft", "loanId": loanId, "currentStep": currentStep or 1})
        elif status == "docs_requested":
            plan.append({"email": email, "action": "respond_docs", "loanId": loanId})
        elif status in ("submitted", "under_review", "docs_submitted"):
            plan.append({"email": email, "action": "advance", "loanId": loanId})
        # anything else (shouldn't happen) is left alone
    return plan


def run_cleanup(conn):
    with conn.cursor() as cur:
        cur.execute(
            "DELETE FROM loan_applications WHERE status = 'draft' AND created_at < NOW() - INTERVAL '1 day' * %s",
            (RETENTION_DRAFT_DAYS,),
        )
        draftDeleted = cur.rowcount
        cur.execute(
            "DELETE FROM loan_applications WHERE status = 'docs_requested' AND updated_at < NOW() - INTERVAL '1 day' * %s",
            (RETENTION_DOCS_REQUESTED_DAYS,),
        )
        docsDeleted = cur.rowcount
        cur.execute(
            "DELETE FROM loan_applications WHERE status IN ('submitted', 'under_review', 'docs_submitted') AND updated_at < NOW() - INTERVAL '1 day' * %s",
            (RETENTION_IN_FLIGHT_DAYS,),
        )
        inFlightDeleted = cur.rowcount
        cur.execute(
            "DELETE FROM loan_applications WHERE status IN ('approved', 'denied') AND decided_at < NOW() - INTERVAL '1 day' * %s",
            (RETENTION_RESOLVED_DAYS,),
        )
        resolvedDeleted = cur.rowcount
    conn.commit()
    log(
        "CLEANUP",
        "deleted — draft:" + str(draftDeleted) +
        " docs_requested:" + str(docsDeleted) +
        " in_flight:" + str(inFlightDeleted) +
        " resolved:" + str(resolvedDeleted),
    )


# ---------------------------------------------------------------------------
# Browser + generic helpers (same conventions as csBankJourneyZoningFunnel)
# ---------------------------------------------------------------------------
def make_driver(userAgentString):
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
    driver.execute_cdp_cmd("Network.clearBrowserCookies", {})
    driver.execute_cdp_cmd("Network.clearBrowserCache", {})
    return driver


def wait(lo=0.8, hi=2.2):
    time.sleep(random.uniform(lo, hi))


def scroll_to(driver, element):
    driver.execute_script("arguments[0].scrollIntoView({behavior:'smooth',block:'center'})", element)
    time.sleep(random.uniform(0.6, 1.2))


def hover(driver, element, duration=600):
    try:
        if element.size["width"] == 0 or element.size["height"] == 0:
            return
    except Exception:
        return
    ActionChains(driver, duration=duration).move_to_element(element).perform()
    time.sleep(random.uniform(0.4, 0.9))


def hover_click(driver, element, wait_after=2.0):
    try:
        if element.size["width"] == 0 or element.size["height"] == 0:
            return
    except Exception:
        return
    ActionChains(driver, duration=random.randint(600, 1000)).move_to_element(element).perform()
    time.sleep(random.uniform(0.3, 0.7))
    element.click()
    time.sleep(wait_after)


def excessive_hover(driver, element_id, count=5, hover_ms=500):
    el = try_find(driver, element_id, timeout=3)
    if not el:
        return
    for _ in range(count):
        try:
            hover(driver, el, duration=hover_ms)
            ActionChains(driver).move_by_offset(20, 20).perform()
            time.sleep(0.15)
        except Exception:
            pass


def find_clickable(driver, element_id, timeout=10):
    return WebDriverWait(driver, timeout).until(EC.element_to_be_clickable((By.ID, element_id)))


def try_find(driver, element_id, timeout=5):
    try:
        return WebDriverWait(driver, timeout).until(EC.presence_of_element_located((By.ID, element_id)))
    except Exception:
        return None


def cs_check(driver):
    try:
        WebDriverWait(driver, 12).until(
            lambda d: d.execute_script("if(typeof _uxa=='object'){return true;}")
        )
        log("MAIN", "_uxa CS Library confirmed present")
    except Exception:
        log("MAIN", "_uxa not found — CS may not be installed (set CSQ_TAG_ID)")


def cs_identify(driver, email):
    driver.execute_script(
        "if(typeof _uxa!=='undefined') _uxa.push(['trackPageEvent','@user-identifier@" + email + "']);"
    )
    log("MAIN", "CS Identify sent for " + email)


CS_CUSTOM_VAR_INDEX = {
    "script_name": 1,
    "customerType": 2,
    "loanAction": 3,
}


def cs_var(driver, key, value):
    index = CS_CUSTOM_VAR_INDEX[key]
    driver.execute_script(
        "if(typeof _uxa!=='undefined') _uxa.push(['setCustomVariable'," + str(index) + ",'" + key + "','" + str(value) + "','visit']);"
    )
    log("MAIN", "CS dynamic variable set: " + key + " = " + str(value))


def cs_event(driver, name):
    driver.execute_script("if(typeof _uxa!=='undefined') _uxa.push(['trackPageEvent','" + name + "']);")
    log("MAIN", "CS event fired: '" + name + "'")


def login_persona(driver, email, password):
    driver.get(siteBaseUrl + "/login")
    time.sleep(random.uniform(2, 3))
    find_clickable(driver, "login-email").send_keys(email)
    wait(0.4, 0.8)
    find_clickable(driver, "login-password").send_keys(password)
    wait(0.4, 0.8)
    find_clickable(driver, "login-submit").click()
    WebDriverWait(driver, 10).until(lambda d: "/login" not in d.current_url)
    time.sleep(random.uniform(1, 2))
    cs_check(driver)
    cs_identify(driver, email)
    cs_var(driver, "script_name", "csBankLoanApplicationFunnel")
    cs_var(driver, "customerType", "returning")


# ---------------------------------------------------------------------------
# Actions — every state change goes through the real UI in a real browser.
# ---------------------------------------------------------------------------
def complete_wizard_from_step(driver, loanId, startStep, persona):
    """Drives the loan wizard from whatever step it's currently on through
    to submission. Always completes — no abandonment here; that storytelling
    lives in the main journey script's own (separate, one-off) usage."""
    driver.get(siteBaseUrl + "/loans/" + str(loanId) + "/edit?step=" + str(max(startStep, 1)))
    time.sleep(random.uniform(2, 3))

    if startStep <= 1:
        amountField = find_clickable(driver, "loan-requested-amount")
        scroll_to(driver, amountField)
        hover_click(driver, amountField, wait_after=0.3)
        amountField.send_keys(str(random.choice([2500, 5000, 10000, 15000, 25000])))
        wait(0.5, 1.0)
        Select(find_clickable(driver, "loan-term-months")).select_by_value(str(random.choice([24, 36, 48, 60])))
        wait(0.4, 0.8)
        purposeField = find_clickable(driver, "loan-purpose")
        hover_click(driver, purposeField, wait_after=0.3)
        purposeField.send_keys(random.choice(["Debt consolidation", "Home repairs", "Vehicle purchase", "Medical expenses"]))
        wait(0.6, 1.2)
        hover_click(driver, find_clickable(driver, "loan-submit-btn"), wait_after=random.uniform(2, 3))
        log("MAIN", "Step 1 complete")

    if startStep <= 2:
        occupationField = find_clickable(driver, "loan-occupation")
        scroll_to(driver, occupationField)
        hover_click(driver, occupationField, wait_after=0.3)
        occupationField.send_keys(persona["customerOccupation"])
        wait(0.6, 1.2)
        if random.random() < 0.3:
            excessive_hover(driver, "loan-income-bracket", count=4, hover_ms=450)
        Select(find_clickable(driver, "loan-income-bracket")).select_by_value(persona["customerAnnualIncomeBracket"])
        wait(0.5, 1.0)
        Select(find_clickable(driver, "loan-net-worth-bracket")).select_by_value(persona["customerNetWorthBracket"])
        wait(0.6, 1.2)
        hover_click(driver, find_clickable(driver, "loan-submit-btn"), wait_after=random.uniform(2, 3))
        log("MAIN", "Step 2 complete")

    submitBtn = find_clickable(driver, "loan-submit-btn")
    scroll_to(driver, submitBtn)
    hover_click(driver, submitBtn, wait_after=random.uniform(3, 5))
    cs_event(driver, "LoanApplicationSubmitted")
    log("MAIN", "Loan application submitted")


def start_new_application(driver, email):
    persona = personaByEmail[email]
    loanType = random.choice(["personal", "auto"])
    driver.get(siteBaseUrl + "/loans/new?loan_type=" + loanType)
    time.sleep(random.uniform(2, 3))
    cs_event(driver, "LoanApplicationStarted")
    cs_var(driver, "loanAction", "started_new")
    log("MAIN", "Started a new " + loanType + " loan application for " + email)
    currentUrl = driver.current_url
    loanId = currentUrl.split("/loans/")[1].split("/")[0]
    complete_wizard_from_step(driver, loanId, 1, persona)


def resume_draft(driver, email, loanId, currentStep):
    persona = personaByEmail[email]
    log("MAIN", "Resuming draft loan " + str(loanId) + " for " + email + " at step " + str(currentStep))
    cs_var(driver, "loanAction", "resumed_draft")
    complete_wizard_from_step(driver, loanId, currentStep, persona)


def advance_loan(driver, loanId):
    driver.get(siteBaseUrl + "/loans/" + str(loanId))
    time.sleep(random.uniform(2, 3))
    cs_var(driver, "loanAction", "advanced")
    btn = try_find(driver, "loan-advance-btn", timeout=5)
    if not btn:
        log("MAIN", "loan-advance-btn not found for loan " + str(loanId) + " — status may have changed, skipping")
        return
    scroll_to(driver, btn)
    hover_click(driver, btn, wait_after=random.uniform(3, 5))
    log("MAIN", "Advanced underwriting status for loan " + str(loanId))


def respond_docs(driver, loanId):
    driver.get(siteBaseUrl + "/loans/" + str(loanId))
    time.sleep(random.uniform(2, 3))
    cs_var(driver, "loanAction", "responded_docs")
    btn = try_find(driver, "loan-respond-docs-btn", timeout=5)
    if not btn:
        log("MAIN", "loan-respond-docs-btn not found for loan " + str(loanId) + " — status may have changed, skipping")
        return
    scroll_to(driver, btn)
    hover_click(driver, btn, wait_after=random.uniform(2, 3))
    log("MAIN", "Responded to docs request for loan " + str(loanId))


def run_persona_action(item):
    email = item["email"]
    persona = personaByEmail[email]
    userAgentString = random.choice(UA_POOL)
    driver = make_driver(userAgentString)
    try:
        login_persona(driver, email, persona["customerPassword"])
        if item["action"] == "start_new":
            start_new_application(driver, email)
        elif item["action"] == "resume_draft":
            resume_draft(driver, email, item["loanId"], item["currentStep"])
        elif item["action"] == "advance":
            advance_loan(driver, item["loanId"])
        elif item["action"] == "respond_docs":
            respond_docs(driver, item["loanId"])
    except Exception as ex:
        log("ERROR", email + " (" + item["action"] + "): " + str(ex))
    finally:
        driver.quit()


# ---------------------------------------------------------------------------
# [MAIN]
# ---------------------------------------------------------------------------
conn = db_connect()
try:
    rows = fetch_pool_states(conn)
    plan = plan_actions(rows)

    log("PLAN", str(len(plan)) + " persona(s) due this run: " +
        str([{"email": p["email"], "action": p["action"]} for p in plan]))

    for item in plan:
        run_persona_action(item)

    run_cleanup(conn)
finally:
    conn.close()

print("[DONE] " + "=" * 60)
print("[DONE] scriptRunTimestamp = " + str(scriptRunTimestamp))
print("[DONE] actions performed  = " + str(len(plan)))
print("[DONE] " + "=" * 60)
