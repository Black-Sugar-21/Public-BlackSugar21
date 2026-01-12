// Example: Angular Service with Firebase Integration
// Location: src/app/services/match.service.ts

import { Injectable } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  CollectionReference,
  DocumentReference,
  onSnapshot,
  Unsubscribe
} from '@angular/fire/firestore';
import { Observable, BehaviorSubject, from, of } from 'rxjs';
import { map, catchError, tap } from 'rxjs/operators';

// Data models
interface Match {
  id?: string;
  participants: string[];
  status: 'active' | 'inactive' | 'deleted';
  lastMessageTimestamp: number;
  createdAt: number;
  unreadCount: { [userId: string]: number };
}

interface Message {
  id?: string;
  senderId: string;
  text: string;
  timestamp: number;
  read: boolean;
  type: 'text' | 'image' | 'ephemeral';
}

@Injectable({
  providedIn: 'root'
})
export class MatchService {
  private matchesSubject = new BehaviorSubject<Match[]>([]);
  public matches$ = this.matchesSubject.asObservable();
  
  private listeners: Unsubscribe[] = [];

  constructor(private firestore: Firestore) {}

  // ============================================================================
  // Example 1: Get Matches (Promise-based)
  // ============================================================================
  
  async getUserMatches(userId: string): Promise<Match[]> {
    try {
      const matchesRef = collection(this.firestore, 'matches');
      const q = query(
        matchesRef,
        where('participants', 'array-contains', userId),
        where('status', '==', 'active'),
        orderBy('lastMessageTimestamp', 'desc'),
        limit(50)
      );

      const snapshot = await getDocs(q);
      
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Match));
    } catch (error) {
      console.error('Error getting matches:', error);
      throw error;
    }
  }

  // ============================================================================
  // Example 2: Get Matches (Observable-based)
  // ============================================================================
  
  getUserMatchesObservable(userId: string): Observable<Match[]> {
    const matchesRef = collection(this.firestore, 'matches');
    const q = query(
      matchesRef,
      where('participants', 'array-contains', userId),
      where('status', '==', 'active'),
      orderBy('lastMessageTimestamp', 'desc')
    );

    const promise = getDocs(q);
    
    return from(promise).pipe(
      map(snapshot => 
        snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as Match))
      ),
      tap(matches => console.log(`Found ${matches.length} matches`)),
      catchError(error => {
        console.error('Error fetching matches:', error);
        return of([]);
      })
    );
  }

  // ============================================================================
  // Example 3: Real-time Listener with BehaviorSubject
  // ============================================================================
  
  listenToUserMatches(userId: string): void {
    // Remove existing listeners
    this.removeAllListeners();

    const matchesRef = collection(this.firestore, 'matches');
    const q = query(
      matchesRef,
      where('participants', 'array-contains', userId),
      where('status', '==', 'active'),
      orderBy('lastMessageTimestamp', 'desc')
    );

    // Setup real-time listener
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const matches = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as Match));
        
        this.matchesSubject.next(matches);
      },
      (error) => {
        console.error('Error in match listener:', error);
      }
    );

    this.listeners.push(unsubscribe);
  }

  // ============================================================================
  // Example 4: Get Single Match
  // ============================================================================
  
  getMatch(matchId: string): Observable<Match | null> {
    const matchRef = doc(this.firestore, 'matches', matchId);
    const promise = getDoc(matchRef);

    return from(promise).pipe(
      map(snapshot => {
        if (snapshot.exists()) {
          return {
            id: snapshot.id,
            ...snapshot.data()
          } as Match;
        }
        return null;
      }),
      catchError(error => {
        console.error('Error getting match:', error);
        return of(null);
      })
    );
  }

  // ============================================================================
  // Example 5: Get Messages for Match
  // ============================================================================
  
  async getMessages(matchId: string, limitCount: number = 50): Promise<Message[]> {
    try {
      const messagesRef = collection(
        this.firestore, 
        'matches', 
        matchId, 
        'messages'
      );
      
      const q = query(
        messagesRef,
        orderBy('timestamp', 'desc'),
        limit(limitCount)
      );

      const snapshot = await getDocs(q);
      
      return snapshot.docs
        .map(doc => ({
          id: doc.id,
          ...doc.data()
        } as Message))
        .reverse(); // Reverse to show oldest first
    } catch (error) {
      console.error('Error getting messages:', error);
      return [];
    }
  }

  // ============================================================================
  // Example 6: Real-time Messages Listener
  // ============================================================================
  
  listenToMessages(matchId: string): Observable<Message[]> {
    return new Observable(subscriber => {
      const messagesRef = collection(
        this.firestore,
        'matches',
        matchId,
        'messages'
      );
      
      const q = query(
        messagesRef,
        orderBy('timestamp', 'asc')
      );

      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const messages = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          } as Message));
          
          subscriber.next(messages);
        },
        (error) => {
          subscriber.error(error);
        }
      );

      // Store listener for cleanup
      this.listeners.push(unsubscribe);

      // Cleanup function
      return () => {
        unsubscribe();
      };
    });
  }

  // ============================================================================
  // Example 7: Send Message
  // ============================================================================
  
  async sendMessage(matchId: string, message: Partial<Message>): Promise<string> {
    try {
      const messagesRef = collection(
        this.firestore,
        'matches',
        matchId,
        'messages'
      );

      const messageData = {
        ...message,
        timestamp: Date.now(),
        read: false
      };

      const docRef = await addDoc(messagesRef, messageData);
      
      // Update match metadata
      await this.updateMatchMetadata(matchId, {
        lastMessageTimestamp: messageData.timestamp
      });

      return docRef.id;
    } catch (error) {
      console.error('Error sending message:', error);
      throw error;
    }
  }

  // ============================================================================
  // Example 8: Update Match
  // ============================================================================
  
  async updateMatchMetadata(
    matchId: string, 
    updates: Partial<Match>
  ): Promise<void> {
    try {
      const matchRef = doc(this.firestore, 'matches', matchId);
      await updateDoc(matchRef, updates);
    } catch (error) {
      console.error('Error updating match:', error);
      throw error;
    }
  }

  // ============================================================================
  // Example 9: Delete Match
  // ============================================================================
  
  async deleteMatch(matchId: string): Promise<void> {
    try {
      const matchRef = doc(this.firestore, 'matches', matchId);
      
      // Soft delete - just update status
      await updateDoc(matchRef, { 
        status: 'deleted',
        deletedAt: Date.now()
      });

      // Or hard delete (use carefully)
      // await deleteDoc(matchRef);
    } catch (error) {
      console.error('Error deleting match:', error);
      throw error;
    }
  }

  // ============================================================================
  // Example 10: Mark Messages as Read
  // ============================================================================
  
  async markMessagesAsRead(matchId: string, messageIds: string[]): Promise<void> {
    try {
      // Note: Firestore doesn't have batch operations in modular SDK
      // Use individual updates or Cloud Function for batch operations
      const updatePromises = messageIds.map(messageId => {
        const messageRef = doc(
          this.firestore,
          'matches',
          matchId,
          'messages',
          messageId
        );
        return updateDoc(messageRef, { read: true });
      });

      await Promise.all(updatePromises);
    } catch (error) {
      console.error('Error marking messages as read:', error);
      throw error;
    }
  }

  // ============================================================================
  // Cleanup
  // ============================================================================
  
  removeAllListeners(): void {
    this.listeners.forEach(unsubscribe => unsubscribe());
    this.listeners = [];
  }

  ngOnDestroy(): void {
    this.removeAllListeners();
  }
}

/*
 BEST PRACTICES:
 
 1. Use Observable pattern for reactive data
 2. Implement proper error handling with catchError
 3. Use BehaviorSubject for state management
 4. Clean up listeners to prevent memory leaks
 5. Use async/await for cleaner Promise code
 6. Type everything with TypeScript interfaces
 7. Handle offline scenarios gracefully
 8. Use tap() operator for side effects/logging
 9. Implement retry logic for failed operations
 10. Cache data when appropriate
 
 COMMON PITFALLS:
 
 1. Forgetting to unsubscribe from listeners
 2. Not handling errors properly
 3. Creating too many real-time listeners (cost)
 4. Not typing data properly (any types)
 5. Mixing Promise and Observable patterns inconsistently
 6. Not implementing loading states
 7. Forgetting to update timestamps
 8. Not validating data before sending to Firestore
 
 ANGULAR SPECIFIC:
 
 1. Use @Injectable with providedIn: 'root' for singleton services
 2. Inject Firestore in constructor
 3. Return Observables for async operations (Angular convention)
 4. Use async pipe in templates for automatic subscription management
 5. Implement OnDestroy lifecycle hook for cleanup
 
 FIREBASE SPECIFICS:
 
 1. Use collection() and doc() from modular SDK
 2. Queries are immutable - create new query for changes
 3. array-contains only works with single value (not arrays)
 4. orderBy must match whereField if both used
 5. Composite indexes required for complex queries
 6. Real-time listeners have cost implications
 
 PERFORMANCE TIPS:
 
 1. Limit query results to what's needed
 2. Use pagination for large datasets
 3. Implement virtual scrolling for long lists
 4. Cache frequently accessed data
 5. Use where() to filter on server side
 6. Avoid n+1 queries with proper data structure
 7. Consider denormalization for read-heavy data
 8. Monitor Firestore usage in console
 */
