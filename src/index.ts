import puppeteer, { Page, Browser } from "puppeteer";
import treeKill from "tree-kill";

import { statusLog, getHostname, autoScroll } from "./utils";
import { SessionExpired } from "./errors";
import { Experience, getExperiences } from "./experience";
import { Education, getEducation } from "./education";
import { getProfile, Profile } from "./profile";
import { getVolunteering, Volunteering } from "./volunteer";
import { getSkills, Skill } from "./skills";

interface ScraperUserDefinedOptions {
  /**
   * The LinkedIn `li_at` session cookie value. Get this value by logging in to LinkedIn with the account you want to use for scraping.
   * Open your browser's Dev Tools and find the cookie with the name `li_at`. Use that value here.
   *
   * This script uses a known session cookie of a successful login into LinkedIn, instead of an e-mail and password to set you logged in.
   * I did this because LinkedIn has security measures by blocking login requests from unknown locations or requiring you to fill in Captcha's upon login.
   * So, if you run this from a server and try to login with an e-mail address and password, your login could be blocked.
   * By using a known session, we prevent this from happening and allows you to use this scraper on any server on any location.
   *
   * You probably need to get a new session cookie value when the scraper logs show it's not logged in anymore.
   */
  sessionCookieValue: string;
  /**
   * Set to true if you want to keep the scraper session alive. This results in faster recurring scrapes.
   * But keeps your memory usage high.
   *
   * Default: `false`
   */
  keepAlive?: boolean;
  /**
   * Set a custom user agent if you like.
   *
   * Default: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36`
   */
  userAgent?: string;
  /**
   * Use a custom timeout to set the maximum time you want to wait for the scraper
   * to do his job.
   *
   * Default: `10000` (10 seconds)
   */
  timeout?: number;
  /**
   * Start the scraper in headless mode, or not.
   *
   * Default: `true`
   */
  headless?: boolean;
}

interface ScraperOptions {
  sessionCookieValue: string;
  keepAlive: boolean;
  userAgent: string;
  timeout: number;
  headless: boolean;
}

interface Result {
  profile: Profile;
  experiences: Experience[];
  education: Education[];
  volunteering: Volunteering[];
  skills: Skill[];
}

export class LinkedInProfileScraper {
  readonly options: ScraperOptions = {
    sessionCookieValue: "",
    keepAlive: false,
    timeout: 10000,
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36",
    headless: true,
  };

  private browser: Browser | null = null;

  constructor(userDefinedOptions: ScraperUserDefinedOptions) {
    const logSection = "constructing";
    const errorPrefix = "Error during setup.";

    if (!userDefinedOptions.sessionCookieValue) {
      throw new Error(
        `${errorPrefix} Option "sessionCookieValue" is required.`
      );
    }

    if (
      userDefinedOptions.sessionCookieValue &&
      typeof userDefinedOptions.sessionCookieValue !== "string"
    ) {
      throw new Error(
        `${errorPrefix} Option "sessionCookieValue" needs to be a string.`
      );
    }

    if (
      userDefinedOptions.userAgent &&
      typeof userDefinedOptions.userAgent !== "string"
    ) {
      throw new Error(
        `${errorPrefix} Option "userAgent" needs to be a string.`
      );
    }

    if (
      userDefinedOptions.keepAlive !== undefined &&
      typeof userDefinedOptions.keepAlive !== "boolean"
    ) {
      throw new Error(
        `${errorPrefix} Option "keepAlive" needs to be a boolean.`
      );
    }

    if (
      userDefinedOptions.timeout !== undefined &&
      typeof userDefinedOptions.timeout !== "number"
    ) {
      throw new Error(`${errorPrefix} Option "timeout" needs to be a number.`);
    }

    if (
      userDefinedOptions.headless !== undefined &&
      typeof userDefinedOptions.headless !== "boolean"
    ) {
      throw new Error(
        `${errorPrefix} Option "headless" needs to be a boolean.`
      );
    }

    this.options = Object.assign(this.options, userDefinedOptions);

    statusLog(logSection, `Using options: ${JSON.stringify(this.options)}`);
  }

  /**
   * Method to load Puppeteer in memory so we can re-use the browser instance.
   */
  public setup = async () => {
    const logSection = "setup";

    try {
      statusLog(
        logSection,
        `Launching puppeteer in the ${
          this.options.headless ? "background" : "foreground"
        }...`
      );

      const defaultArgs = [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--proxy-server='direct://",
        "--proxy-bypass-list=*",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--disable-gpu",
        "--disable-features=site-per-process",
        "--enable-features=NetworkService",
        "--allow-running-insecure-content",
        "--enable-automation",
        "--disable-background-timer-throttling",
        "--disable-backgrounding-occluded-windows",
        "--disable-renderer-backgrounding",
        "--disable-web-security",
        "--autoplay-policy=user-gesture-required",
        "--disable-background-networking",
        "--disable-breakpad",
        "--disable-client-side-phishing-detection",
        "--disable-component-update",
        "--disable-default-apps",
        "--disable-domain-reliability",
        "--disable-extensions",
        "--disable-features=AudioServiceOutOfProcess",
        "--disable-hang-monitor",
        "--disable-ipc-flooding-protection",
        "--disable-notifications",
        "--disable-offer-store-unmasked-wallet-cards",
        "--disable-popup-blocking",
        "--disable-print-preview",
        "--disable-prompt-on-repost",
        "--disable-speech-api",
        "--disable-sync",
        "--disk-cache-size=33554432",
        "--hide-scrollbars",
        "--ignore-gpu-blacklist",
        "--metrics-recording-only",
        "--mute-audio",
        "--no-default-browser-check",
        "--no-first-run",
        "--no-pings",
        "--no-zygote",
        "--password-store=basic",
        "--use-gl=swiftshader",
        "--use-mock-keychain",
      ];

      const args = defaultArgs;

      if (this.options.headless) {
        args.push("--headless");
        args.push("--single-process");
      } else {
        args.push("--start-maximized");
      }

      this.browser = await puppeteer.launch({
        headless: this.options.headless,
        args,
        timeout: this.options.timeout,
      });

      statusLog(logSection, "Puppeteer launched!");

      await this.checkIfLoggedIn();

      statusLog(logSection, "Done!");
    } catch (err) {
      // Kill Puppeteer
      await this.close();

      statusLog(logSection, "An error occurred during setup.");

      throw err;
    }
  };

  /**
   * Create a Puppeteer page with some extra settings to speed up the crawling process.
   */
  private createPage = async (): Promise<Page> => {
    const logSection = "setup page";

    if (!this.browser) {
      throw new Error("Browser not set.");
    }

    // Important: Do not block "stylesheet", makes the crawler not work for LinkedIn
    const blockedResources: puppeteer.ResourceType[] = [
      "image",
      "media",
      "font",
      "texttrack",
      "manifest",
    ];

    try {
      const page = await this.browser.newPage();

      // Use already open page
      // This makes sure we don't have an extra open tab consuming memory
      // const allPages = await this.browser.pages();

      // for (const p of allPages) {
      //   if (p !== page) {
      //     await p.close();
      //   }
      // }

      // Method to create a faster Page
      // From: https://github.com/shirshak55/scrapper-tools/blob/master/src/fastPage/index.ts#L113
      const session = await page.target().createCDPSession();
      await page.setBypassCSP(true);
      await session.send("Page.enable");
      await session.send("Page.setWebLifecycleState", {
        state: "active",
      });

      const allowedHostnames = [
        "linkedin.com",
        "www.linkedin.com",
        "platform.linkedin.com",
        "realtime.www.linkedin.com",
      ];

      const blockedUrls = ["https://www.linkedin.com/li/track"];

      // Block loading of resources, like images and css, we dont need that
      await page.setRequestInterception(true);

      page.on("request", (req) => {
        if (blockedResources.includes(req.resourceType())) {
          return req.abort();
        }

        const hostname = getHostname(req.url());

        if (blockedUrls.includes(req.url())) {
          return req.abort();
        }

        // Block all script requests from certain host names
        if (hostname && !allowedHostnames.includes(hostname)) {
          return req.abort();
        }

        return req.continue();
      });

      await page.setUserAgent(this.options.userAgent);

      await page.setViewport({
        width: 1200,
        height: 720,
      });

      statusLog(
        logSection,
        `Setting session cookie using cookie: ${process.env.LINKEDIN_SESSION_COOKIE_VALUE}`
      );

      await page.setCookie({
        name: "li_at",
        value: this.options.sessionCookieValue,
        domain: ".www.linkedin.com",
      });

      statusLog(logSection, "Session cookie set!");

      statusLog(logSection, "Done!");

      return page;
    } catch (err) {
      // Kill Puppeteer
      await this.close();

      statusLog(logSection, "An error occurred during page setup.");
      statusLog(logSection, err.message);

      throw err;
    }
  };

  /**
   * Method to complete kill any Puppeteer process still active.
   * Freeing up memory.
   */
  public close = (page?: Page): Promise<void> => {
    return new Promise(async (resolve, reject) => {
      const loggerPrefix = "close";

      if (page) {
        try {
          statusLog(loggerPrefix, "Closing page...");
          await page.close();
          statusLog(loggerPrefix, "Closed page!");
        } catch (err) {
          reject(err);
        }
      }

      if (this.browser) {
        try {
          statusLog(loggerPrefix, "Closing browser...");
          await this.browser.close();
          statusLog(loggerPrefix, "Closed browser!");

          const browserProcessPid = this.browser.process()?.pid;

          // Completely kill the browser process to prevent zombie processes
          // https://docs.browserless.io/blog/2019/03/13/more-observations.html#tip-2-when-you-re-done-kill-it-with-fire
          if (browserProcessPid) {
            statusLog(
              loggerPrefix,
              `Killing browser process pid: ${browserProcessPid}...`
            );

            treeKill(browserProcessPid, "SIGKILL", (err) => {
              if (err) {
                return reject(
                  `Failed to kill browser process pid: ${browserProcessPid}`
                );
              }

              statusLog(
                loggerPrefix,
                `Killed browser pid: ${browserProcessPid} Closed browser.`
              );
              resolve();
            });
          }
        } catch (err) {
          reject(err);
        }
      }

      return resolve();
    });
  };

  /**
   * Simple method to check if the session is still active.
   */
  public checkIfLoggedIn = async () => {
    const logSection = "checkIfLoggedIn";

    const page = await this.createPage();

    statusLog(logSection, "Checking if we are still logged in...");

    // Go to the login page of LinkedIn
    // If we do not get redirected and stay on /login, we are logged out
    // If we get redirect to /feed, we are logged in
    await page.goto("https://www.linkedin.com/login", {
      waitUntil: "domcontentloaded",
      timeout: this.options.timeout,
    });

    const url = page.url();

    const isLoggedIn = !url.endsWith("/login");

    await page.close();

    if (isLoggedIn) {
      statusLog(logSection, "All good. We are still logged in.");
    } else {
      const errorMessage =
        'Bad news, we are not logged in! Your session seems to be expired. Use your browser to login again with your LinkedIn credentials and extract the "li_at" cookie value for the "sessionCookieValue" option.';
      statusLog(logSection, errorMessage);
      throw new SessionExpired(errorMessage);
    }
  };

  /**
   * Method to scrape a user profile.
   */
  public run = async (profileUrl: string): Promise<Result> => {
    const logSection = "run";

    const scraperSessionId = new Date().getTime();

    if (!this.browser) {
      throw new Error("Browser is not set. Please run the setup method first.");
    }

    if (!profileUrl) {
      throw new Error("No profileUrl given.");
    }

    if (!profileUrl.includes("linkedin.com/")) {
      throw new Error("The given URL to scrape is not a linkedin.com url.");
    }

    try {
      // Eeach run has it's own page
      const page = await this.createPage();

      statusLog(
        logSection,
        `Navigating to LinkedIn profile: ${profileUrl}`,
        scraperSessionId
      );

      await page.goto(profileUrl, {
        // Use "networkidl2" here and not "domcontentloaded".
        // As with "domcontentloaded" some elements might not be loaded correctly, resulting in missing data.
        waitUntil: "domcontentloaded",
        timeout: this.options.timeout,
      });

      statusLog(logSection, "LinkedIn profile page loaded!", scraperSessionId);

      statusLog(
        logSection,
        "Getting all the LinkedIn profile data by scrolling the page to the bottom, so all the data gets loaded into the page...",
        scraperSessionId
      );

      await autoScroll(page);

      // Get data in the open profile page
      const profile = await getProfile(page);
      const volunteering = await getVolunteering(page);

      // await page.close();

      // Open new tabs and get the data
      const [experiences, education, skills] = await Promise.all([
        getExperiences(profileUrl, this.createPage),
        getEducation(profileUrl, this.createPage),
        getSkills(profileUrl, this.createPage),
      ]);

      console.log("profile", profile);
      console.log("experience", experiences);
      console.log("education", education);
      console.log("volunteering", volunteering);
      console.log("skills", skills);

      statusLog(
        logSection,
        `Done! Returned profile details for: ${profileUrl}`,
        scraperSessionId
      );

      if (!this.options.keepAlive) {
        statusLog(logSection, "Not keeping the session alive.");

        await this.close(page);

        statusLog(logSection, "Done. Puppeteer is closed.");
      } else {
        statusLog(logSection, "Done. Puppeteer is being kept alive in memory.");

        // Only close the current page, we do not need it anymore
        await page.close();
      }

      return {
        profile,
        experiences,
        education,
        volunteering,
        skills,
      };
    } catch (err) {
      // Kill Puppeteer
      await this.close();

      statusLog(logSection, "An error occurred during a run.");

      // Throw the error up, allowing the user to handle this error himself.
      throw err;
    }
  };
}
