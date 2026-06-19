package sgpo.repositories;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import sgpo.entities.Node;

import java.util.List;
import java.util.Optional;

public interface NodeRepository extends JpaRepository<Node, String> {
    Optional<Node> findByCode(String code);

    @Query("SELECT n.type, COUNT(n) FROM Node n GROUP BY n.type")
    List<Object[]> countByType();

    @Query("SELECT COUNT(n) FROM Node n WHERE n.description IS NULL OR n.description = ''")
    long countByDescriptionIsNullOrEmpty();

    @Query("SELECT n FROM Node n WHERE n.type = sgpo.enums.NodeType.METIER AND COALESCE(n.actif, false) = true ORDER BY n.nomFr ASC")
    List<Node> findActiveMetiers();
}
