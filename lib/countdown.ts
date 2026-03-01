export interface TimeRemaining {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  isExpired: boolean;
  total: number; // total seconds
}

export function getTimeRemaining(targetDate: string | Date): TimeRemaining {
  const now = new Date();
  const target = typeof targetDate === 'string' ? new Date(targetDate) : targetDate;

  const total = Math.max(0, Math.floor((target.getTime() - now.getTime()) / 1000));
  const isExpired = total <= 0;

  const days = Math.floor(total / (60 * 60 * 24));
  const hours = Math.floor((total % (60 * 60 * 24)) / (60 * 60));
  const minutes = Math.floor((total % (60 * 60)) / 60);
  const seconds = total % 60;

  return { days, hours, minutes, seconds, isExpired, total };
}

export function formatCountdown(time: TimeRemaining): string {
  if (time.isExpired) {
    return 'Time\'s up!';
  }

  if (time.days > 0) {
    return `${time.days}d ${time.hours}h`;
  }

  if (time.hours > 0) {
    return `${time.hours}h ${time.minutes}m`;
  }

  if (time.minutes > 0) {
    return `${time.minutes}m ${time.seconds}s`;
  }

  return `${time.seconds}s`;
}

export function formatCountdownLong(time: TimeRemaining): string {
  if (time.isExpired) {
    return 'Deadline passed';
  }

  const parts: string[] = [];

  if (time.days > 0) {
    parts.push(`${time.days} day${time.days !== 1 ? 's' : ''}`);
  }

  if (time.hours > 0) {
    parts.push(`${time.hours} hour${time.hours !== 1 ? 's' : ''}`);
  }

  if (time.minutes > 0) {
    parts.push(`${time.minutes} minute${time.minutes !== 1 ? 's' : ''}`);
  }

  if (time.seconds > 0 && time.total < 300) {
    // Only show seconds if less than 5 minutes
    parts.push(`${time.seconds} second${time.seconds !== 1 ? 's' : ''}`);
  }

  return parts.join(', ');
}
