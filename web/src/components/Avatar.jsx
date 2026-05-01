// Single avatar primitive. Variants:
//   variant="dir"          — director circle
//   size="md|lg|xl"        — 32 / 40 / 56
//   dot="mint|peach"       — status dot
// Default = 26px square.

const sizeClass = { md: 'av-32', lg: 'av-40', xl: 'av-56' };

export function Avatar({ initial, variant, size, dot, className = '' }) {
  const cls = ['av'];
  if (variant === 'dir') cls.push('dir');
  if (size && sizeClass[size]) cls.push(sizeClass[size]);
  if (className) cls.push(className);
  return (
    <span className={cls.join(' ')}>
      {initial}
      {dot ? <span className={`dot ${dot}`}></span> : null}
    </span>
  );
}
