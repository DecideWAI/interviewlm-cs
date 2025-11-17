/**
 * Alerting Service
 *
 * Centralized service for sending alerts to various channels
 * (Slack, email, PagerDuty, etc.)
 */

export interface Alert {
  severity: 'critical' | 'warning' | 'info';
  title: string;
  message: string;
  details?: Record<string, any>;
  timestamp?: Date;
}

export interface AlertChannel {
  name: string;
  send: (alert: Alert) => Promise<void>;
}

/**
 * Console logger (always enabled for development)
 */
class ConsoleAlertChannel implements AlertChannel {
  name = 'console';

  async send(alert: Alert): Promise<void> {
    const emoji = alert.severity === 'critical' ? '🚨' : alert.severity === 'warning' ? '⚠️' : 'ℹ️';
    console.error(`${emoji} [${alert.severity.toUpperCase()}] ${alert.title}`);
    console.error(`Message: ${alert.message}`);
    if (alert.details) {
      console.error('Details:', JSON.stringify(alert.details, null, 2));
    }
  }
}

/**
 * Slack webhook alerting
 */
class SlackAlertChannel implements AlertChannel {
  name = 'slack';
  private webhookUrl: string;

  constructor(webhookUrl: string) {
    this.webhookUrl = webhookUrl;
  }

  async send(alert: Alert): Promise<void> {
    if (!this.webhookUrl) {
      console.warn('[Alerting] Slack webhook URL not configured');
      return;
    }

    const emoji = alert.severity === 'critical' ? ':rotating_light:' :
                  alert.severity === 'warning' ? ':warning:' : ':information_source:';

    const color = alert.severity === 'critical' ? '#ff0000' :
                  alert.severity === 'warning' ? '#ffa500' : '#0066cc';

    const payload = {
      text: `${emoji} *${alert.title}*`,
      attachments: [
        {
          color,
          fields: [
            {
              title: 'Severity',
              value: alert.severity.toUpperCase(),
              short: true,
            },
            {
              title: 'Time',
              value: (alert.timestamp || new Date()).toISOString(),
              short: true,
            },
            {
              title: 'Message',
              value: alert.message,
              short: false,
            },
          ],
        },
      ],
    };

    if (alert.details) {
      payload.attachments[0].fields.push({
        title: 'Details',
        value: '```' + JSON.stringify(alert.details, null, 2) + '```',
        short: false,
      } as any);
    }

    try {
      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Slack API error: ${response.status}`);
      }
    } catch (error) {
      console.error('[Alerting] Failed to send Slack alert:', error);
      throw error;
    }
  }
}

/**
 * Email alerting (for production)
 */
class EmailAlertChannel implements AlertChannel {
  name = 'email';
  private recipients: string[];

  constructor(recipients: string[]) {
    this.recipients = recipients;
  }

  async send(alert: Alert): Promise<void> {
    console.log(`[Alerting] Would send email to: ${this.recipients.join(', ')}`);
    console.log(`Subject: [${alert.severity.toUpperCase()}] ${alert.title}`);
    console.log(`Body: ${alert.message}`);

    // TODO: Integrate with email service (SendGrid, AWS SES, etc.)
    // Example with SendGrid:
    // await sendgrid.send({
    //   to: this.recipients,
    //   from: 'alerts@interviewlm.com',
    //   subject: `[${alert.severity.toUpperCase()}] ${alert.title}`,
    //   text: alert.message,
    //   html: formatAlertEmail(alert),
    // });
  }
}

/**
 * Central alerting service
 */
class AlertingService {
  private channels: AlertChannel[] = [];
  private enabled: boolean = true;

  constructor() {
    // Always add console channel
    this.addChannel(new ConsoleAlertChannel());

    // Add Slack if webhook URL is configured
    const slackWebhook = process.env.SLACK_ALERT_WEBHOOK_URL;
    if (slackWebhook) {
      this.addChannel(new SlackAlertChannel(slackWebhook));
    }

    // Add email if recipients are configured
    const emailRecipients = process.env.ALERT_EMAIL_RECIPIENTS;
    if (emailRecipients) {
      this.addChannel(new EmailAlertChannel(emailRecipients.split(',')));
    }
  }

  addChannel(channel: AlertChannel): void {
    this.channels.push(channel);
  }

  async sendAlert(alert: Alert): Promise<void> {
    if (!this.enabled) {
      console.log('[Alerting] Alerting is disabled, skipping alert');
      return;
    }

    // Enrich alert with timestamp if not provided
    const enrichedAlert = {
      ...alert,
      timestamp: alert.timestamp || new Date(),
    };

    // Send to all channels in parallel
    const results = await Promise.allSettled(
      this.channels.map((channel) =>
        channel.send(enrichedAlert).catch((error) => {
          console.error(`[Alerting] Failed to send alert via ${channel.name}:`, error);
          throw error;
        })
      )
    );

    // Log any failures
    const failures = results.filter((r) => r.status === 'rejected');
    if (failures.length > 0) {
      console.error(`[Alerting] ${failures.length}/${this.channels.length} channels failed`);
    }
  }

  /**
   * Send critical alert (DLQ failures, system errors, etc.)
   */
  async critical(title: string, message: string, details?: Record<string, any>): Promise<void> {
    await this.sendAlert({
      severity: 'critical',
      title,
      message,
      details,
    });
  }

  /**
   * Send warning alert (performance degradation, high error rates, etc.)
   */
  async warning(title: string, message: string, details?: Record<string, any>): Promise<void> {
    await this.sendAlert({
      severity: 'warning',
      title,
      message,
      details,
    });
  }

  /**
   * Send info alert (system updates, scheduled maintenance, etc.)
   */
  async info(title: string, message: string, details?: Record<string, any>): Promise<void> {
    await this.sendAlert({
      severity: 'info',
      title,
      message,
      details,
    });
  }

  /**
   * Disable alerting (for testing)
   */
  disable(): void {
    this.enabled = false;
  }

  /**
   * Enable alerting
   */
  enable(): void {
    this.enabled = true;
  }
}

// Export singleton instance
export const alerting = new AlertingService();
