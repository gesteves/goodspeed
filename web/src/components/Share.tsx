import { useRef, useState, useSyncExternalStore } from "react";
import {
  faArrowUpFromBracket,
  faCheck,
  faComment,
  faEnvelope,
  faLink,
} from "@fortawesome/pro-regular-svg-icons";
import {
  faBluesky,
  faFacebook,
  faMastodon,
  faReddit,
  faThreads,
} from "@fortawesome/free-brands-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import styles from "./Share.module.css";

const TITLE = "Alcatraz Swim Conditions";

// `useSyncExternalStore` is the React-19-approved way to read a browser API
// during render without mismatching SSR: the server snapshot is always `false`,
// the client snapshot reflects whatever `navigator.share` actually is.
const subscribeNativeShare = () => () => {};
const getNativeShareSnapshot = () =>
  typeof navigator !== "undefined" && typeof navigator.share === "function";
const getNativeShareServerSnapshot = () => false;

/**
 * Build a tagged URL for analytics — same UTM scheme the Kona blog uses for
 * its share buttons so events are comparable across properties.
 */
function tagged(baseUrl: string, source: string, medium: string): string {
  const u = new URL(baseUrl);
  u.searchParams.set("utm_source", source);
  u.searchParams.set("utm_medium", medium);
  u.searchParams.set("utm_content", "share-button");
  return u.toString();
}

/**
 * Row of share buttons rendered between the dashboard and the footer.
 *
 * The native-share button is hidden on first paint and revealed by an effect
 * once `navigator.share` is confirmed available — desktop browsers don't
 * implement it, so SSR'ing it visible would leave a dead button.
 */
export function Share({ baseUrl }: { baseUrl: string }) {
  const canNativeShare = useSyncExternalStore(
    subscribeNativeShare,
    getNativeShareSnapshot,
    getNativeShareServerSnapshot,
  );

  const bluesky = `https://bsky.app/intent/compose?text=${encodeURIComponent(
    `${TITLE}\n\n${tagged(baseUrl, "Bluesky", "social")}`,
  )}`;
  const mastodon = `https://share.joinmastodon.org/?text=${encodeURIComponent(
    `${TITLE}\n\n${tagged(baseUrl, "Mastodon", "social")}`,
  )}`;
  const threads = `https://www.threads.com/intent/post?text=${encodeURIComponent(
    TITLE,
  )}&url=${encodeURIComponent(tagged(baseUrl, "Threads", "social"))}`;
  const reddit = `https://reddit.com/submit?title=${encodeURIComponent(
    TITLE,
  )}&url=${encodeURIComponent(tagged(baseUrl, "Reddit", "social"))}`;
  const facebook = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(
    tagged(baseUrl, "Facebook", "social"),
  )}`;
  const email = `mailto:?subject=${encodeURIComponent(TITLE)}&body=${encodeURIComponent(
    tagged(baseUrl, "Email", "email"),
  )}`;
  const sms = `sms:?&body=${encodeURIComponent(
    `${TITLE} ${tagged(baseUrl, "SMS", "sms")}`,
  )}`;

  const [copied, setCopied] = useState(false);
  const copiedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCopy = async () => {
    try {
      // Bare URL, no UTM — recipients shouldn't inherit attribution as
      // "share-button" if they got the link via a copy-and-paste chain.
      await navigator.clipboard.writeText(baseUrl);
      setCopied(true);
      if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current);
      copiedTimeoutRef.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API rejected (insecure context, denied permission) — ignore.
    }
  };

  const handleNativeShare = async () => {
    try {
      await navigator.share({
        title: TITLE,
        url: tagged(baseUrl, "Share", "share"),
      });
    } catch {
      // User cancelled (AbortError) or share failed -- nothing to do.
    }
  };

  return (
    <section className={styles.share} aria-label="Share this dashboard">
      {canNativeShare && (
        <button
          type="button"
          onClick={handleNativeShare}
          aria-label="Open sharing options"
          title="Open sharing options"
          className={styles.button}
        >
          <FontAwesomeIcon icon={faArrowUpFromBracket} aria-hidden="true" />
        </button>
      )}
      <button
        type="button"
        onClick={handleCopy}
        aria-label={copied ? "Link copied" : "Copy link to clipboard"}
        title={copied ? "Link copied" : "Copy link to clipboard"}
        className={styles.button}
      >
        <FontAwesomeIcon icon={copied ? faCheck : faLink} aria-hidden="true" />
      </button>
      <a
        href={email}
        aria-label="Share by email"
        title="Share by email"
        className={styles.button}
        rel="noopener nofollow"
      >
        <FontAwesomeIcon icon={faEnvelope} aria-hidden="true" />
      </a>
      <a
        href={sms}
        aria-label="Share by text message"
        title="Share by text message"
        className={styles.button}
        rel="noopener nofollow"
      >
        <FontAwesomeIcon icon={faComment} aria-hidden="true" />
      </a>
      <a
        href={bluesky}
        aria-label="Share on Bluesky"
        title="Share on Bluesky"
        className={styles.button}
        target="_blank"
        rel="noopener nofollow"
      >
        <FontAwesomeIcon icon={faBluesky} aria-hidden="true" />
      </a>
      <a
        href={facebook}
        aria-label="Share on Facebook"
        title="Share on Facebook"
        className={styles.button}
        target="_blank"
        rel="noopener nofollow"
      >
        <FontAwesomeIcon icon={faFacebook} aria-hidden="true" />
      </a>
      <a
        href={mastodon}
        aria-label="Share on Mastodon"
        title="Share on Mastodon"
        className={styles.button}
        target="_blank"
        rel="noopener nofollow"
      >
        <FontAwesomeIcon icon={faMastodon} aria-hidden="true" />
      </a>
      <a
        href={threads}
        aria-label="Share on Threads"
        title="Share on Threads"
        className={styles.button}
        target="_blank"
        rel="noopener nofollow"
      >
        <FontAwesomeIcon icon={faThreads} aria-hidden="true" />
      </a>
      <a
        href={reddit}
        aria-label="Share on Reddit"
        title="Share on Reddit"
        className={styles.button}
        target="_blank"
        rel="noopener nofollow"
      >
        <FontAwesomeIcon icon={faReddit} aria-hidden="true" />
      </a>
    </section>
  );
}
