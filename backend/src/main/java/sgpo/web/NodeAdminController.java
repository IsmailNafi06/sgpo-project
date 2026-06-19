package sgpo.web;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import sgpo.entities.Node;
import sgpo.exceptions.NodeNotFoundException;
import sgpo.services.NodeService;

import java.util.List;

@RestController
@RequestMapping("/api/admin/nodes")
@RequiredArgsConstructor
@Slf4j
public class NodeAdminController {

    private final NodeService nodeService;

    // GET /api/admin/nodes
    @GetMapping
    public ResponseEntity<List<Node>> getAllNodes() {
        return ResponseEntity.ok(nodeService.findAll());
    }

    // GET /api/admin/nodes/{id}
    @GetMapping("/{id}")
    public ResponseEntity<Node> getNodeById(@PathVariable String id) {
        try {
            return ResponseEntity.ok(nodeService.findById(id));
        } catch (NodeNotFoundException e) {
            return ResponseEntity.notFound().build();
        }
    }

    // POST /api/admin/nodes
    @PostMapping
    public ResponseEntity<Node> createNode(@RequestBody Node node) {
        return ResponseEntity.ok(nodeService.create(node));
    }

    // PUT /api/admin/nodes/{id}
    @PutMapping("/{id}")
    public ResponseEntity<Node> updateNode(@PathVariable String id, @RequestBody Node node) {
        try {
            return ResponseEntity.ok(nodeService.update(id, node));
        } catch (NodeNotFoundException e) {
            return ResponseEntity.notFound().build();
        }
    }

    // DELETE /api/admin/nodes/{id}
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteNode(@PathVariable String id) {
        try {
            nodeService.delete(id);
            return ResponseEntity.noContent().build();
        } catch (NodeNotFoundException e) {
            return ResponseEntity.notFound().build();
        }
    }

}
