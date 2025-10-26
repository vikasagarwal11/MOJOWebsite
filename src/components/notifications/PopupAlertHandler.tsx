import React, { useEffect, useState } from 'react';
import { collection, query, where, getDocs, updateDoc, doc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useNavigate } from 'react-router-dom';

interface PopupAlert {
  id: string;
  userId: string;
  type: 'promotion' | 'reminder' | 'urgent';
  title: string;
  message: string;
  eventId: string;
  createdAt: any;
  acknowledged: boolean;
}

interface PopupAlertHandlerProps {
  userId: string;
}

const PopupAlertHandler: React.FC<PopupAlertHandlerProps> = ({ userId }) => {
  const navigate = useNavigate();
  const [hasCheckedAlerts, setHasCheckedAlerts] = useState(false);

  useEffect(() => {
    if (!userId || hasCheckedAlerts) return;

    const checkForPopupAlerts = async () => {
      try {
        console.log('🔍 Checking for popup alerts for user:', userId);
        
        const alertsQuery = query(
          collection(db, 'popup_alerts'),
          where('userId', '==', userId),
          where('acknowledged', '==', false)
        );
        
        const alertsSnapshot = await getDocs(alertsQuery);
        
        if (!alertsSnapshot.empty) {
          // Get the most recent alert
          const latestAlert = alertsSnapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .sort((a, b) => {
              const aTime = a.createdAt?.toDate?.() || new Date(a.createdAt);
              const bTime = b.createdAt?.toDate?.() || new Date(b.createdAt);
              return bTime.getTime() - aTime.getTime();
            })[0] as PopupAlert;
          
          console.log('🚨 Found popup alert:', latestAlert);
          
          // Show popup confirmation
          const userChoice = confirm(`
🚨 ${latestAlert.title}

${latestAlert.message}

Would you like to proceed now?
✅ Yes - Take me there
❌ No - Dismiss
          `);
          
          if (userChoice) {
            // Navigate to event with promotion flag
            navigate(`/events/${latestAlert.eventId}?promotion=true&alertId=${latestAlert.id}`);
          }
          
          // Mark alert as acknowledged
          await updateDoc(doc(db, 'popup_alerts', latestAlert.id), {
            acknowledged: true,
            acknowledgedAt: new Date(),
            userAction: userChoice ? 'proceeded' : 'dismissed'
          });
          
          console.log('✅ Popup alert handled:', latestAlert.id);
        } else {
          console.log('ℹ️ No popup alerts found for user:', userId);
        }
        
      } catch (error) {
        console.error('❌ Error checking popup alerts:', error);
      } finally {
        setHasCheckedAlerts(true);
      }
    };

    // Small delay to avoid interrupting page load
    const timeoutId = setTimeout(checkForPopupAlerts, 1000);
    
    return () => clearTimeout(timeoutId);
  }, [userId, navigate, hasCheckedAlerts]);

  // Return a visual indicator for VIP users
  const showVIPIndicator = () => {
    // You could enhance this to check user's VIP status
    return (
      <div className="fixed bottom-4 right-4 bg-purple-600 text-white px-3 py-2 rounded-lg shadow-lg">
        <div className="flex items-center gap-2">
          <span>⭐</span>
          <span className="text-sm font-medium">Priority Alerts Active</span>
        </div>
      </div>
    );
  };

  return null; // This component doesn't render anything visible
};

export default PopupAlertHandler;
