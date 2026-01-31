import { Router, Request, Response } from 'express';
import { AccountImport, Conductor, OptionExpectedMove, BrokerCaller, PlaceOrderHelper, ErrorHelper, LogHelper } from 'lumostrade';

const router: Router = Router();

router.get('/', async (req: Request, res: Response) => {
  const op = req.query.op;

  if (!op) {
    return res.status(400).json({ success: false, message: 'Missing "op" parameter' });
  }

  try {
    switch (op) {   
      case 'refresh':
        // Throttle broker load so the cron job has a higher chance of running
        // successfully without hitting broker API rate limits.
        const conductorError = await Conductor.RefreshTheWorld(false, 5);
        const failureMessage = conductorError.FormatFailures();
        if (failureMessage) {
          ErrorHelper.LogErrorForGCP(new Error(`Broker refresh completed with failures: ${failureMessage}`), 'Broker refresh completed with failures');
        }
        return res.status(200).json({ success: true, message: 'Broker data refreshed successfully' });

      case 'expectedMoves':
        // Update expected moves for registered symbols
        await OptionExpectedMove.UpdateExpectedMoves();
        return res.status(200).json({ success: true, message: 'Expected moves updated successfully' });

      case 'testAccessTokens':
        // Trigger a check of broker access token expirations
        await BrokerCaller.CheckIfAccessTokensExpireSoon();
        return res.status(200).json({ success: true, message: 'Access token expiration check triggered' });

      case 'processOrders':
        // Trigger execution of pending orders for extended hours trading
        await PlaceOrderHelper.ProcessOrders();
        return res.status(200).json({ success: true, message: 'Place orders processed successfully' });

      case 'testEmail':
        // Test email logging via LogHelper — subject and body are taken from query string params
        {
          const subject = typeof req.query.subject === 'string' ? req.query.subject : String(req.query.subject || '');
          const body = typeof req.query.body === 'string' ? req.query.body : String(req.query.body || '');
          if (!body) {
            return res.status(400).json({ success: false, message: 'Missing "body" query parameter' });
          }
          LogHelper.LogForEmail(body, subject);
          return res.status(200).json({ success: true, message: 'Test email logged' });
        }

      case 'testError':
        // Test error logging via ErrorHelper — message taken from "msg" query string param
        {
          const msg = typeof req.query.msg === 'string' ? req.query.msg : String(req.query.msg || '');
          if (!msg) {
            return res.status(400).json({ success: false, message: 'Missing "msg" query parameter' });
          }
          ErrorHelper.LogErrorForGCP(msg, 'testError');
          return res.status(200).json({ success: true, message: 'Test error logged' });
        }

      default:
        return res.status(400).json({ success: false, message: `Unknown operation: ${op}` });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'An unknown error occurred';
    ErrorHelper.LogErrorForGCP(error, `Cron operation "${op}" failed`);
    return res.status(500).json({ success: false, message });
  }
});

export default router;
