package sgpo.web;

import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import sgpo.entities.Edge;
import sgpo.exceptions.EdgeNotFoundException;
import sgpo.services.EdgeService;

import java.util.List;

@RestController
@RequestMapping("/api/admin/edges")
@RequiredArgsConstructor
public class EdgeAdminController {

    private final EdgeService edgeService;

    @GetMapping
    public ResponseEntity<List<Edge>> getAllEdges() {
        return ResponseEntity.ok(edgeService.findAll());
    }

    @GetMapping("/{id}")
    public ResponseEntity<Edge> getEdgeById(@PathVariable String id) {
        try {
            return ResponseEntity.ok(edgeService.findById(id));
        } catch (EdgeNotFoundException e) {
            return ResponseEntity.notFound().build();
        }
    }

    @PostMapping
    public ResponseEntity<Edge> createEdge(@RequestBody Edge edge) {
        return ResponseEntity.ok(edgeService.create(edge));
    }

    @PutMapping("/{id}")
    public ResponseEntity<Edge> updateEdge(@PathVariable String id, @RequestBody Edge edge) {
        try {
            return ResponseEntity.ok(edgeService.update(id, edge));
        } catch (EdgeNotFoundException e) {
            return ResponseEntity.notFound().build();
        }
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteEdge(@PathVariable String id) {
        try {
            edgeService.delete(id);
            return ResponseEntity.noContent().build();
        } catch (EdgeNotFoundException e) {
            return ResponseEntity.notFound().build();
        }
    }
}