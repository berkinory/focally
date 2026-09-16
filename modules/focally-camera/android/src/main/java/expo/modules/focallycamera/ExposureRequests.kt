package expo.modules.focallycamera

class ExposureRequests {
    private var revision = 0
    private var requested: Int? = null
    var applied = 0
        private set

    var pending = false
        private set

    fun reset(index: Int = 0) {
        revision++
        requested = null
        applied = index
        pending = false
    }

    fun request(index: Int): Int? {
        if ((pending && requested == index) || (!pending && applied == index)) return null
        requested = index
        pending = true
        return ++revision
    }

    fun complete(token: Int, index: Int): Boolean {
        if (!pending || token != revision) return false
        applied = index
        pending = false
        return true
    }

    fun fail(token: Int): Boolean {
        if (!pending || token != revision) return false
        pending = false
        return true
    }
}
