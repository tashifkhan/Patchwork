package expo.modules.patchworkshortcuts

import android.app.PendingIntent
import androidx.annotation.RequiresApi
import androidx.appfunctions.AppFunctionAppUnknownException
import androidx.appfunctions.AppFunctionDeclaration
import androidx.appfunctions.AppFunctionElementNotFoundException
import androidx.appfunctions.AppFunctionException
import androidx.appfunctions.AppFunctionInvalidArgumentException
import androidx.appfunctions.AppFunctionSerializable
import androidx.appfunctions.AppFunctionService
import androidx.appfunctions.AppFunctionServiceEntryPoint
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.format.DateTimeFormatter
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject

/** A to-do Patchwork accepted and will save the next time it opens. */
@AppFunctionSerializable(isDescribedByKDoc = true)
class QueuedTask(
  /** The to-do's title, as Patchwork will save it. */
  val title: String,
  /** The notes saved with the to-do, or null for none. */
  val notes: String?,
  /** The day the to-do is due, or null for no due date. */
  val dueDate: LocalDate?,
  /** The time of day it is due, or null for the end of the day. */
  val dueTime: LocalTime?,
  /** The list name that was asked for, or null for the list open in Patchwork. */
  val list: String?,
  /** Opens Patchwork, which saves the to-do right away and shows it. */
  val openPatchwork: PendingIntent
)

/** One open to-do that is due today or overdue. */
@AppFunctionSerializable(isDescribedByKDoc = true)
class TodayTask(
  /** The to-do's title. */
  val title: String,
  /** The name of the list it is in. */
  val list: String,
  /** When it is due, or null if Patchwork has no time for it. */
  val dueAt: Instant?,
  /** True when the due date has already passed. */
  val overdue: Boolean
)

/** The user's open to-dos for today, overdue ones first. */
@AppFunctionSerializable(isDescribedByKDoc = true)
class TodayTasks(
  /** When Patchwork last refreshed this list. Changes made since then elsewhere aren't included. */
  val updatedAt: Instant,
  /** How many open to-dos are due today. */
  val dueTodayCount: Int,
  /** How many open to-dos are overdue. */
  val overdueCount: Int,
  /** Up to 40 of them, overdue first, then due today. */
  val tasks: List<TodayTask>,
  /** Opens Patchwork on the Today view. */
  val openToday: PendingIntent
)

/** One of the user's to-do lists. */
@AppFunctionSerializable(isDescribedByKDoc = true)
class TaskListInfo(
  /** The list's name, as shown in Patchwork. */
  val name: String,
  /** The account the list belongs to, such as a Nextcloud account or the phone itself. Empty when unknown. */
  val account: String
)

/** The user's to-do lists. */
@AppFunctionSerializable(isDescribedByKDoc = true)
class TaskLists(
  /** Every list Patchwork showed the last time it refreshed. */
  val lists: List<TaskListInfo>
)

/**
 * Patchwork's actions for Gemini and other assistants, through Android
 * AppFunctions. The KSP compiler generates [PatchworkAppFunctionService] from
 * this class, and an XML description of each function for the assistant. The
 * app-level description is in res/xml/patchwork_app_function_metadata.xml.
 *
 * To-dos live in JS (CalDAV accounts, Apple-style on-device storage), which
 * isn't running when an assistant calls in. So reads come from the snapshot
 * JS writes with every widget refresh, and createTask queues the to-do for JS
 * to save through the app's own code path when Patchwork next opens.
 */
@RequiresApi(36)
@AppFunctionServiceEntryPoint(
  serviceName = "PatchworkAppFunctionService",
  appFunctionXmlFileName = "patchwork_app_functions"
)
abstract class PatchworkAppFunctions : AppFunctionService() {

  /**
   * Adds a to-do to Patchwork. Patchwork saves it the next time the app opens
   * or comes to the foreground, so it doesn't show in Patchwork, its widgets
   * or the user's calendar accounts until then.
   *
   * @param title What the to-do is, such as "Call the dentist". Must not be empty.
   * @param notes Extra detail for the to-do. If null, the to-do has no notes.
   * @param dueDate The day it is due. If null, it has no due date.
   * @param dueTime The time of day it is due on dueDate. Ignored without dueDate. If null, it is due by the end of that day.
   * @param list The name of an existing Patchwork list, such as "Groceries". A partial name matches. If null or not found, Patchwork uses the list open on its Tasks screen, or the first list.
   * @return The queued to-do, with a link that opens Patchwork to save it now.
   */
  @AppFunctionDeclaration(isDescribedByKDoc = true)
  suspend fun createTask(
    title: String,
    notes: String? = null,
    dueDate: LocalDate? = null,
    dueTime: LocalTime? = null,
    list: String? = null
  ): QueuedTask = guarded {
    val cleanTitle = title.trim()
    if (cleanTitle.isEmpty()) throw AppFunctionInvalidArgumentException("The to-do needs a title.")
    val cleanNotes = notes?.trim()?.takeIf { it.isNotEmpty() }
    val cleanList = list?.trim()?.takeIf { it.isNotEmpty() }
    val time = dueTime.takeIf { dueDate != null }
    val action = JSONObject()
      .put("type", "createTask")
      .put("title", cleanTitle)
      .put("source", "assistant")
    cleanNotes?.let { action.put("notes", it) }
    dueDate?.let { action.put("dueDate", it.toString()) }
    time?.let { action.put("dueTime", it.format(DateTimeFormatter.ofPattern("HH:mm"))) }
    cleanList?.let { action.put("list", it) }
    PendingActions.add(applicationContext, action)
    QueuedTask(
      title = cleanTitle,
      notes = cleanNotes,
      dueDate = dueDate,
      dueTime = time,
      list = cleanList,
      openPatchwork = DeepLinks.pendingIntent(applicationContext, "patchwork:///")
    )
  }

  /**
   * Lists the user's open to-dos that are due today or overdue, as of the
   * last time Patchwork refreshed. Read-only.
   *
   * @return The to-dos, overdue first, with counts and a link to the Today view.
   */
  @AppFunctionDeclaration(isDescribedByKDoc = true)
  suspend fun listTodayTasks(): TodayTasks = guarded {
    val snapshot = AssistantSnapshot.read(applicationContext)
      ?: throw AppFunctionElementNotFoundException("Patchwork hasn't loaded any to-dos yet. Open it once first.")
    val items = snapshot.optJSONArray("today")
    val tasks = (0 until (items?.length() ?: 0)).mapNotNull { index ->
      val item = items?.optJSONObject(index) ?: return@mapNotNull null
      TodayTask(
        title = item.optString("title"),
        list = item.optString("list"),
        dueAt = item.optString("dueAt").takeIf { it.isNotEmpty() }?.let { runCatching { Instant.parse(it) }.getOrNull() },
        overdue = item.optBoolean("overdue")
      )
    }
    TodayTasks(
      updatedAt = Instant.ofEpochMilli(snapshot.optLong("generatedAt")),
      dueTodayCount = snapshot.optInt("dueTodayCount"),
      overdueCount = snapshot.optInt("overdueCount"),
      tasks = tasks,
      openToday = DeepLinks.pendingIntent(applicationContext, "patchwork:///?smart=today")
    )
  }

  /**
   * Lists the user's to-do lists by name. Read-only.
   *
   * @return The lists Patchwork showed the last time it refreshed.
   */
  @AppFunctionDeclaration(isDescribedByKDoc = true)
  suspend fun listTaskLists(): TaskLists = guarded {
    val snapshot = AssistantSnapshot.read(applicationContext)
      ?: throw AppFunctionElementNotFoundException("Patchwork hasn't loaded any lists yet. Open it once first.")
    val items = snapshot.optJSONArray("lists")
    TaskLists(
      lists = (0 until (items?.length() ?: 0)).mapNotNull { index ->
        val item = items?.optJSONObject(index) ?: return@mapNotNull null
        TaskListInfo(name = item.optString("name"), account = item.optString("account"))
      }
    )
  }

  /**
   * Gets a link that opens a brain dump in Patchwork, a screen for writing or
   * saying everything on the user's mind before sorting it into to-dos.
   *
   * @return A link that opens the brain dump screen.
   */
  @AppFunctionDeclaration(isDescribedByKDoc = true)
  suspend fun openBrainDump(): PendingIntent = guarded {
    DeepLinks.pendingIntent(applicationContext, "patchwork:///brain-dump")
  }

  /**
   * Gets a link that opens Patchwork's voice dictation, which turns what the
   * user says into to-dos they review before saving.
   *
   * @return A link that opens Patchwork with dictation listening.
   */
  @AppFunctionDeclaration(isDescribedByKDoc = true)
  suspend fun openDictation(): PendingIntent = guarded {
    DeepLinks.pendingIntent(applicationContext, "patchwork:///?dictate=1")
  }

  /** Runs off the main thread and turns every failure into an AppFunctionException the agent can explain. */
  private suspend fun <T> guarded(block: suspend () -> T): T {
    return try {
      withContext(Dispatchers.IO) { block() }
    } catch (e: AppFunctionException) {
      throw e
    } catch (e: CancellationException) {
      throw e
    } catch (e: Exception) {
      throw AppFunctionAppUnknownException("Patchwork couldn't finish that: ${e.message ?: e::class.simpleName}")
    }
  }
}
