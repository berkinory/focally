package expo.modules.focallycamera

import org.junit.Assert.*
import org.junit.Test

class ExposureRequestsTest {
    @Test
    fun draggingImmediatelySupersedesPendingExposureWithoutWaitingForIt() {
        val requests = ExposureRequests()
        val first = requests.request(1)!!
        val latest = requests.request(6)!!
        assertNotEquals(first, latest)
        assertFalse(requests.fail(first))
        assertTrue(requests.pending)
        assertFalse(requests.complete(first, 1))
        assertTrue(requests.complete(latest, 6))
        assertEquals(6, requests.applied)
        assertFalse(requests.pending)
    }

    @Test
    fun returningToTheAppliedValueStillCancelsAnUnfinishedChange() {
        val requests = ExposureRequests()
        val old = requests.request(3)!!
        val reset = requests.request(0)!!
        assertTrue(requests.complete(reset, 0))
        assertFalse(requests.fail(old))
        assertEquals(0, requests.applied)
        assertNull(requests.request(0))
    }

    @Test
    fun duplicatesFailuresAndNewCameraSessionsKeepTheirOwnState() {
        val requests = ExposureRequests()
        val first = requests.request(-2)!!
        assertNull(requests.request(-2))
        assertTrue(requests.fail(first))
        val retry = requests.request(-2)!!
        requests.reset(4)
        assertFalse(requests.complete(retry, -2))
        assertEquals(4, requests.applied)
        assertFalse(requests.pending)
        assertNull(requests.request(4))
    }
}
