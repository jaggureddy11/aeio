import Foundation
import CoreGraphics

func getPos() -> CGPoint {
    return CGEvent(source: nil)?.location ?? .zero
}

func moveMouse(x: Double, y: Double) {
    let point = CGPoint(x: x, y: y)
    CGWarpMouseCursorPosition(point)
    let moveEvent = CGEvent(mouseEventSource: nil, mouseType: .mouseMoved, mouseCursorPosition: point, mouseButton: .left)
    moveEvent?.post(tap: .cghidEventTap)
}

func clickMouse(x: Double, y: Double, button: String = "left", double: Bool = false) {
    let point = CGPoint(x: x, y: y)
    CGWarpMouseCursorPosition(point)
    usleep(15000)

    let isRight = button == "right"
    let downType: CGEventType = isRight ? .rightMouseDown : .leftMouseDown
    let upType: CGEventType = isRight ? .rightMouseUp : .leftMouseUp
    let mouseBtn: CGMouseButton = isRight ? .right : .left

    let down = CGEvent(mouseEventSource: nil, mouseType: downType, mouseCursorPosition: point, mouseButton: mouseBtn)
    let up = CGEvent(mouseEventSource: nil, mouseType: upType, mouseCursorPosition: point, mouseButton: mouseBtn)

    down?.post(tap: .cghidEventTap)
    usleep(25000)
    up?.post(tap: .cghidEventTap)

    if double {
        usleep(40000)
        down?.setIntegerValueField(.mouseEventClickState, value: 2)
        up?.setIntegerValueField(.mouseEventClickState, value: 2)
        down?.post(tap: .cghidEventTap)
        usleep(25000)
        up?.post(tap: .cghidEventTap)
    }
}

func dragMouse(startX: Double, startY: Double, endX: Double, endY: Double) {
    let start = CGPoint(x: startX, y: startY)
    let end = CGPoint(x: endX, y: endY)
    CGWarpMouseCursorPosition(start)
    usleep(20000)

    let down = CGEvent(mouseEventSource: nil, mouseType: .leftMouseDown, mouseCursorPosition: start, mouseButton: .left)
    down?.post(tap: .cghidEventTap)
    usleep(30000)

    let steps = 15
    for i in 1...steps {
        let t = Double(i) / Double(steps)
        let currX = startX + (endX - startX) * t
        let currY = startY + (endY - startY) * t
        let pt = CGPoint(x: currX, y: currY)
        let drag = CGEvent(mouseEventSource: nil, mouseType: .leftMouseDragged, mouseCursorPosition: pt, mouseButton: .left)
        drag?.post(tap: .cghidEventTap)
        usleep(10000)
    }

    let up = CGEvent(mouseEventSource: nil, mouseType: .leftMouseUp, mouseCursorPosition: end, mouseButton: .left)
    up?.post(tap: .cghidEventTap)
}

func scrollMouse(dx: Int32, dy: Int32) {
    let scrollEvent = CGEvent(scrollWheelEvent2Source: nil, units: .line, wheelCount: 2, wheel1: dy, wheel2: dx, wheel3: 0)
    scrollEvent?.post(tap: .cghidEventTap)
}

let args = CommandLine.arguments
if args.count > 1 {
    let cmd = args[1]
    switch cmd {
    case "location":
        let pos = getPos()
        print("{\"x\": \(pos.x), \"y\": \(pos.y)}")
    case "move":
        if args.count >= 4, let x = Double(args[2]), let y = Double(args[3]) {
            moveMouse(x: x, y: y)
            print("{\"success\": true, \"action\": \"move\", \"x\": \(x), \"y\": \(y)}")
        }
    case "click":
        var x = args.count >= 4 ? (Double(args[2]) ?? -1) : -1
        var y = args.count >= 4 ? (Double(args[3]) ?? -1) : -1
        let btn = args.count >= 5 ? args[4] : (args.count >= 3 && (args[2] == "right" || args[2] == "left") ? args[2] : "left")
        let doubleClick = args.contains("double")
        if x < 0 || y < 0 {
            let p = getPos()
            x = p.x
            y = p.y
        }
        clickMouse(x: x, y: y, button: btn, double: doubleClick)
        print("{\"success\": true, \"action\": \"click\", \"x\": \(x), \"y\": \(y), \"button\": \"\(btn)\"}")
    case "drag":
        if args.count >= 6, let sx = Double(args[2]), let sy = Double(args[3]), let ex = Double(args[4]), let ey = Double(args[5]) {
            dragMouse(startX: sx, startY: sy, endX: ex, endY: ey)
            print("{\"success\": true, \"action\": \"drag\", \"startX\": \(sx), \"startY\": \(sy), \"endX\": \(ex), \"endY\": \(ey)}")
        }
    case "scroll":
        let dx = args.count >= 3 ? (Int32(args[2]) ?? 0) : 0
        let dy = args.count >= 4 ? (Int32(args[3]) ?? 0) : 0
        scrollMouse(dx: dx, dy: dy)
        print("{\"success\": true, \"action\": \"scroll\", \"dx\": \(dx), \"dy\": \(dy)}")
    default:
        print("{\"error\": \"unknown command\"}")
    }
} else {
    print("Usage: cursor_ctrl [location|move <x> <y>|click <x> <y> [left|right] [double]|drag <sx> <sy> <ex> <ey>|scroll <dx> <dy>]")
}
