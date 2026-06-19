package sgpo.repositories;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import sgpo.entities.Edge;

import java.util.List;

public interface EdgeRepository extends JpaRepository<Edge, String> {
    @Query("SELECT e FROM Edge e JOIN FETCH e.source JOIN FETCH e.target")
    List<Edge> findAllWithNodes();

    @Query("SELECT e.typeLien, COUNT(e) FROM Edge e GROUP BY e.typeLien")
    List<Object[]> countByTypeLien();

    @Query("SELECT COUNT(e) FROM Edge e WHERE e.source IS NULL OR e.target IS NULL")
    long countOrphanEdges();
}
